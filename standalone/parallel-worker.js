importScripts('parallel-engine.js');
const JOB_KEY='parallel-job-v1';let engine, job, pending=new Map(), requestId=0, stopped=false;
const status=(state,message,extra={})=>postMessage({type:'status',status:{state,message, ...(extra.job?{bytes:extra.job.parts.filter(p=>p.done).reduce((n,p)=>n+p.end-p.start+1,0),total:extra.job.size}:{}), ...(extra.error?{error:extra.error}:{})}});
function persist(value){return new Promise((resolve,reject)=>{const id=++requestId;pending.set(id,{resolve,reject});postMessage({type:'save-job',requestId:id,job:value});});}
function directory(){return navigator.storage.getDirectory().then(root=>root.getDirectoryHandle('parallel-v1',{create:true}));}
const disk={open:async part=>(await (await directory()).getFileHandle(String(part.start),{create:true})).createWritable(),read:async part=>(await (await directory()).getFileHandle(String(part.start))).getFile(),checkpoint:persist};
onmessage=async event=>{
  const data=event.data||{};
  if(data.type==='saved-job'){pending.get(data.requestId)?.resolve();pending.delete(data.requestId);return;}
  if(data.type==='save-failed'){pending.get(data.requestId)?.reject(new Error('Não foi possível salvar o progresso.'));pending.delete(data.requestId);return;}
  if(data.type==='pause'){stopped=true;engine?.stop();return;}
  if(data.type!=='start')return;
  if(engine&&!stopped){status('downloading','Já existe um download em andamento.',{job});return;}
  stopped=false;engine=new ParallelEngine();
  try{
    const url=new URL(data.url);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Link HTTP/HTTPS inválido.');
    job=data.job;
    if(job){
      if(job.url!==url.href)throw new Error('Já existe outro download paralelo. Descarte as partes antes de começar outro.');
      const dir=await directory();
      for(const part of job.parts.filter(item=>item.done)){try{if((await (await dir.getFileHandle(String(part.start))).getFile()).size!==part.end-part.start+1)part.done=false;}catch{part.done=false;}}
    }else{
      const meta=await engine.inspect(url.href), estimate=await navigator.storage.estimate();
      if(estimate.quota-estimate.usage<meta.size*1.1)throw new Error('Espaço temporário insuficiente. Use o modo padrão.');
      job={...meta,version:1,parts:[]};const chunk=8*1024*1024;
      if(Math.ceil(meta.size/chunk)>10000)throw new Error('Arquivo acima do limite experimental.');
      for(let start=0;start<meta.size;start+=chunk)job.parts.push({start,end:Math.min(start+chunk-1,meta.size-1),done:false});
      await persist(job);
    }
    status('downloading','Baixando partes…',{job});
    await engine.run(job,disk,async value=>{job=value;status('downloading','Baixando partes…',{job});});
    if(stopped)return;
    await persist(job);status('complete','Download pronto. Abra o popup para salvar o arquivo.',{job});
  }catch(error){
    if(stopped)return;
    const fallback=!job && (error instanceof TypeError||/Não informou tamanho|não informou tamanho|página, não um arquivo|Servidor incompatível|intervalo inválida|temporário|Failed to fetch|NetworkError/i.test(error.message||''));
    if(fallback){postMessage({type:'fallback',url:data.url});return;}
    status(error.message==='Pausado.'?'paused':'error',error.message||'Falha no download paralelo.',{job,error:error.message});
  }
};
