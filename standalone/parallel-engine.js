/* Disk adapter contract: open(part), commit(part), read(part), checkpoint(job).
 * No whole-file ArrayBuffer/Blob assembly; only streamed chunks are held in RAM. */
class ParallelEngine {
  constructor(fetcher = fetch) { this.fetcher = fetcher; this.controller = new AbortController(); }
  stop() { this.controller.abort(); }
  async response(url, headers) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    this.controller.signal.addEventListener('abort', abort, {once:true});
    if (this.controller.signal.aborted) abort();
    let timer = setTimeout(abort, 30000);
    try {
      const response = await this.fetcher(url, {headers, signal:controller.signal, credentials:'omit', redirect:'error', cache:'no-store'});
      return {response, touch(){clearTimeout(timer);timer=setTimeout(abort,30000);}, dispose:()=>{clearTimeout(timer);this.controller.signal.removeEventListener('abort',abort);}};
    } catch(error) { clearTimeout(timer); this.controller.signal.removeEventListener('abort',abort); throw error; }
  }
  validate(response, start, end, size, etag) {
    if (response.status !== 206 || response.headers.get('Content-Range') !== `bytes ${start}-${end}/${size}` || response.headers.get('ETag') !== etag || !etag || etag.startsWith('W/') || !etag.startsWith('"') || response.headers.get('Content-Encoding') && response.headers.get('Content-Encoding') !== 'identity') throw new Error('Servidor incompatível ou arquivo alterado. Use o modo padrão.');
  }
  async inspect(url) {
    const request = await this.response(url, {Range:'bytes=0-0'});
    try {
      const r=request.response, range=/^bytes 0-0\/(\d+)$/.exec(r.headers.get('Content-Range') || '');
      const size=Number(range?.[1]), etag=r.headers.get('ETag');
      if (!Number.isSafeInteger(size) || size <= 0) throw new Error('Tamanho não verificável. Use o modo padrão.');
      this.validate(r,0,0,size,etag);
      const reader=r.body.getReader();let received=0;
      try { while(true){const chunk=await reader.read();if(chunk.done)break;request.touch();received+=chunk.value.byteLength;if(received>1)throw new Error('Resposta de intervalo inválida.');} } finally {await reader.cancel();}
      if(received!==1)throw new Error('Resposta truncada.');
      return {url,size,etag};
    } finally { await request.response.body?.cancel().catch(()=>{}); request.dispose(); }
  }
  async run(job, disk, progress=()=>{}) {
    const meta=await this.inspect(job.url);
    if(meta.size!==job.size || meta.etag!==job.etag)throw new Error('Arquivo alterado. Descarte as partes e comece novamente.');
    let cursor=0;
    const worker=async()=>{
      while(cursor<job.parts.length){
        const part=job.parts[cursor++];if(part.done)continue;
        if(this.controller.signal.aborted)throw new Error('Pausado.');
        let committed=false,lastError;
        for(let attempt=0;attempt<3&&!committed;attempt++){
          let req,writer,reader;
          try {
            req=await this.response(job.url,{Range:`bytes=${part.start}-${part.end}`,'If-Range':job.etag});
            const status=req.response.status;
            if(status===429||status>=500){
              const retryAfter=Number(req.response.headers.get('Retry-After'));
              const delay=Number.isFinite(retryAfter)&&retryAfter>0?Math.min(retryAfter*1000,30000):Math.min(1000*2**attempt,8000);
              if(attempt===2)throw new Error('Servidor temporariamente indisponível após três tentativas.');
              await req.response.body?.cancel();req.dispose();req=null;
              await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,delay);this.controller.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new Error('Pausado.'));},{once:true});});
              continue;
            }
            this.validate(req.response,part.start,part.end,job.size,job.etag);
            writer=await disk.open(part);reader=req.response.body.getReader();let bytes=0;
            while(true){const chunk=await reader.read();if(chunk.done)break;req.touch();bytes+=chunk.value.byteLength;if(bytes>part.end-part.start+1)throw new Error('Parte excedeu o intervalo.');await writer.write(chunk.value);}
            if(bytes!==part.end-part.start+1)throw new Error('Parte truncada.');
            await writer.close();writer=null;
            part.done=true;await disk.checkpoint(job);progress(job);committed=true;
          } catch(error) {
            lastError=error;
            if(this.controller.signal.aborted||error.message==='Servidor incompatível ou arquivo alterado. Use o modo padrão.'||error.message==='Arquivo alterado. Descarte as partes e comece novamente.')throw error;
            const transient=(error instanceof TypeError||error?.name==='TypeError')||/truncada|temporariamente indisponível|Failed to fetch|NetworkError/i.test(error.message);
            if(!transient||attempt===2)throw error;
            await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,Math.min(1000*2**attempt,8000));this.controller.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new Error('Pausado.'));},{once:true});});
          } finally {await reader?.cancel().catch(()=>{});await writer?.abort().catch(()=>{});if(req){await req.response.body?.cancel().catch(()=>{});req.dispose();}}
        }
        if(!committed)throw lastError||new Error('Não foi possível baixar a parte.');
      }
    };
    const outcomes=await Promise.allSettled(Array.from({length:Math.min(4,job.parts.length)},()=>worker().catch(error=>{this.stop();throw error;})));
    const failed=outcomes.find(x=>x.status==='rejected');if(failed)throw failed.reason;
  }
  async assemble(job,disk,writer){
    try {
      let bytes=0;
      for(const part of job.parts){
        if(!part.done)throw new Error('Parte ausente.');
        const file=await disk.read(part);if(file.size!==part.end-part.start+1)throw new Error('Parte local inválida.');
        const reader=file.stream().getReader();
        try{while(true){if(this.controller.signal.aborted)throw new Error('Salvamento cancelado.');const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;await writer.write(chunk.value);}}finally{await reader.cancel();}
      }
      if(bytes!==job.size)throw new Error('Tamanho final inválido.');
      await writer.close();
    }catch(error){await writer.abort().catch(()=>{});throw error;}
  }
}
