const $=id=>document.getElementById(id), JOB_KEY='parallel-job-v1', STATUS_KEY='parallel-status-v1';
let job=null,status={state:'idle'},saving=false;
function show(text){$('status').textContent=text;}
function render(){
  const active=status.state==='starting'||status.state==='downloading';
  $('inspect').hidden=!!job;$('start').hidden=!job||active||status.state==='complete';$('pause').hidden=!active;
  $('save').hidden=!job||!job.parts?.every(part=>part.done);$('discard').hidden=!job;
  $('inspect').disabled=active;$('start').disabled=active||saving;$('pause').disabled=saving;$('save').disabled=saving||!job?.parts?.every(part=>part.done);
  if(job?.parts){const total=job.size||0,bytes=job.parts.filter(part=>part.done).reduce((n,part)=>n+part.end-part.start+1,0);$('progress').max=total||1;$('progress').value=bytes;$('progress').hidden=false;}else $('progress').hidden=true;
  if(status.message)show(status.message);
}
async function refresh(){
  const data=await chrome.storage.local.get([JOB_KEY,STATUS_KEY]);job=data[JOB_KEY]||null;status=data[STATUS_KEY]||{state:job?'paused':'idle',message:job?'Download pronto para retomar.':'Cole o link direto do arquivo.'};if(job&&document.activeElement!==$('url'))$('url').value=job.url;render();
}
async function command(action,extra={}){const result=await chrome.runtime.sendMessage({action,...extra});if(result?.error)throw new Error(result.error);return result;}
$('inspect').onclick=async()=>{
  try{
    const url=new URL($('url').value.trim());if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('Informe um link HTTP ou HTTPS válido.');
    if(!await chrome.permissions.request({origins:['*://*/*']}))throw new Error('Permissão para acessar sites HTTP/HTTPS foi recusada.');
    status={state:'starting',message:'Preparando download paralelo…'};render();await command('start-parallel',{url:url.href});await refresh();
  }catch(error){show(error.message||'Não foi possível iniciar o download.');}
};
$('start').onclick=async()=>{try{const url=job.url;if(!await chrome.permissions.contains({origins:['*://*/*']})){if(!await chrome.permissions.request({origins:['*://*/*']}))throw new Error('Permissão para acessar sites HTTP/HTTPS foi recusada.');}await command('start-parallel',{url});await refresh();}catch(error){show(error.message);}};
$('pause').onclick=async()=>{try{await command('pause-parallel');await refresh();}catch(error){show(error.message);}};
$('discard').onclick=async()=>{try{await command('discard-parallel');await refresh();}catch(error){show(error.message);}};
$('save').onclick=async()=>{
  if(saving||!job?.parts?.every(part=>part.done))return;
  try{
    const handle=await showSaveFilePicker({suggestedName:job.fileName||'download.bin'});saving=true;render();
    const root=await navigator.storage.getDirectory(),directory=await root.getDirectoryHandle('parallel-v1');
    const disk={read:async part=>(await directory.getFileHandle(String(part.start))).getFile()};
    await new ParallelEngine().assemble(job,disk,await handle.createWritable());show('Arquivo salvo e tamanho verificado.');
  }catch(error){show(error.message||'Não foi possível salvar o arquivo.');}finally{saving=false;render();}
};
refresh().catch(()=>show('Falha ao ler os dados locais.'));
setInterval(()=>refresh().catch(()=>{}),700);
