const $=id=>document.getElementById(id);
let job, engine, working=false, directory;
const storageKey='parallel-job-v1';
const requestedUrl=new URL(location.href).searchParams.get('url');if(requestedUrl)$('url').value=requestedUrl;
function show(text){$('status').textContent=text;}
let writes=Promise.resolve();
function checkpoint(value){const snapshot=structuredClone(value);writes=writes.then(()=>chrome.storage.local.set({[storageKey]:snapshot}));return writes;}
async function folder(){const root=await navigator.storage.getDirectory();return root.getDirectoryHandle('parallel-v1',{create:true});}
const disk={
  async open(part){return (await directory.getFileHandle(String(part.start),{create:true})).createWritable();},
  async read(part){return (await directory.getFileHandle(String(part.start))).getFile();},
  checkpoint
};
function render(){if(!job)return;$('url').value=job.url;$('progress').max=job.size;$('progress').value=job.parts.filter(p=>p.done).reduce((n,p)=>n+p.end-p.start+1,0);$('start').disabled=working;$('save').disabled=working||!job.parts.every(p=>p.done);$('inspect').disabled=working||!!job;$('start').hidden=!job;$('pause').hidden=!working;$('discard').hidden=!job;}
async function locked(fn){if(working)return;working=true;render();try{await navigator.locks.request('parallel-v1',{ifAvailable:true},async lock=>{if(!lock)throw new Error('Já existe outra aba trabalhando neste download.');await fn();});}catch(e){
  if(!job&&e?.name==='TypeError'&&/Failed to fetch|NetworkError/i.test(e.message||'')){
    try{const url=new URL($('url').value.trim());await chrome.downloads.download({url:url.href,conflictAction:'uniquify',saveAs:false});show('Este servidor não permite o modo paralelo. O Chrome iniciou o download padrão, sem aceleração por partes.');}
    catch(fallbackError){show(fallbackError.message||e.message);}
  }else show(e.message||'Não foi possível concluir.');
}finally{working=false;render();}}
$('inspect').onclick=async()=>{
  if(job||working)return;
  try{
    const url=new URL($('url').value.trim());
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('Link inválido.');
    if(url.hostname==='sourceforge.net'&&/^\/projects\/[^/]+\/?$/.test(url.pathname))throw new Error('Esse link abre a página do projeto, não o arquivo. No SourceForge, abra Arquivos, escolha o arquivo e copie o link de download.');
    if(!await chrome.permissions.request({origins:[url.protocol+'//'+url.hostname+'/*']}))throw new Error('Permissão do site recusada.');
    await locked(async()=>{
      if((await chrome.storage.local.get(storageKey))[storageKey])throw new Error('Há um download existente. Reabra esta página.');
      engine=new ParallelEngine();const meta=await engine.inspect(url.href);
      const estimate=await navigator.storage.estimate();if(estimate.quota-estimate.usage<meta.size*1.1)throw new Error('Espaço temporário insuficiente. Use o modo padrão.');
      directory=await folder();job={...meta,version:1,parts:[]};
      const chunk=8*1024*1024;if(Math.ceil(meta.size/chunk)>10000){job=null;throw new Error('Arquivo acima do limite experimental.');}for(let start=0;start<meta.size;start+=chunk)job.parts.push({start,end:Math.min(start+chunk-1,meta.size-1),done:false});
      if(job.parts.length>10000){job=null;throw new Error('Arquivo acima do limite experimental.');}
      await checkpoint(job);render();show('Download paralelo iniciado.');await downloadParts();
    });
  }catch(e){
    if(e?.name==='TypeError' && /Failed to fetch|NetworkError/i.test(e.message||'')) {
      try {
        const url=new URL($('url').value.trim());
        if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('Link inválido.');
    if(url.hostname==='sourceforge.net'&&/^\/projects\/[^/]+\/?$/.test(url.pathname))throw new Error('Esse link abre a página do projeto, não o arquivo. No SourceForge, abra Arquivos, escolha o arquivo e copie o link de download.');
        await chrome.downloads.download({url:url.href,conflictAction:'uniquify',saveAs:false});
        show('Este servidor não permitiu iniciar o modo paralelo. O Chrome começou o download padrão, sem aceleração por partes.');
      } catch(fallbackError) { show(fallbackError.message||e.message); }
    } else show(e.message);
  }
};
async function downloadParts(){
  job=(await chrome.storage.local.get(storageKey))[storageKey];if(!job)throw new Error('Informe o link novamente.');
  const allowed=await chrome.permissions.contains({origins:[new URL(job.url).origin+'/*']});if(!allowed)throw new Error('Acesso ao site foi removido. Refaça o download.');
  directory=await folder();engine=new ParallelEngine();show('Baixando partes…');
  for(const part of job.parts.filter(p=>p.done)){try{const f=await disk.read(part);if(f.size!==part.end-part.start+1)part.done=false;}catch{part.done=false;}}
  await checkpoint(job);render();await engine.run(job,disk,render);show('Download pronto. Toque em Salvar arquivo.');
}
$('start').onclick=()=>locked(downloadParts);
$('pause').onclick=()=>{engine?.stop();show('Interrompendo. Partes completas serão preservadas.');};
$('save').onclick=async()=>{
  if(working||!job?.parts.every(p=>p.done))return;
  try{
    const handle=await showSaveFilePicker({suggestedName:'download.bin'});
    await locked(async()=>{job=(await chrome.storage.local.get(storageKey))[storageKey];if(!job)throw new Error('Download descartado em outra aba.');directory=await folder();engine=new ParallelEngine();show('Montando e salvando…');await engine.assemble(job,disk,await handle.createWritable());show('Arquivo salvo e tamanho verificado.');});
  }catch(e){show(e.message);}
};
$('discard').onclick=()=>locked(async()=>{
  const root=await navigator.storage.getDirectory();await root.removeEntry('parallel-v1',{recursive:true}).catch(e=>{if(e.name!=='NotFoundError')throw e;});
  await chrome.storage.local.remove(storageKey);job=null;engine?.stop();$('inspect').disabled=false;$('start').disabled=true;$('save').disabled=true;$('progress').removeAttribute('value');show('Partes e link removidos.');
});
(async()=>{job=(await chrome.storage.local.get(storageKey))[storageKey];if(job?.version!==1)job=null;render();if(job)show('Download recuperado. Clique em Baixar / retomar para revalidar.');})().catch(()=>show('Falha ao ler dados locais.'));
