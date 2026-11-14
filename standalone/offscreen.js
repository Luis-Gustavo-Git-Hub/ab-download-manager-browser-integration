const JOB_KEY='parallel-job-v1', STATUS_KEY='parallel-status-v1';
let worker;
const saveStatus=status=>chrome.storage.local.set({[STATUS_KEY]:{...status,updated:Date.now()}});
function ensureWorker(){if(!worker){worker=new Worker('parallel-worker.js');worker.onmessage=onWorkerMessage;worker.onerror=()=>saveStatus({state:'error',message:'A transferência em segundo plano foi interrompida. Reabra o popup para retomar as partes concluídas.'});worker.onmessageerror=()=>saveStatus({state:'error',message:'Falha ao receber o progresso. Reabra o popup para retomar.'});}return worker;}
async function onWorkerMessage(event){
  const data=event.data||{};
  if(data.type==='save-job'){
    try{await chrome.storage.local.set({[JOB_KEY]:data.job});worker?.postMessage({type:'saved-job',requestId:data.requestId});}
    catch{worker?.postMessage({type:'save-failed',requestId:data.requestId});}
  }else if(data.type==='status') await saveStatus(data.status);
  else if(data.type==='fallback'){
    await saveStatus({state:'fallback',message:'Este site não aceitou partes; o Chrome iniciou o download padrão.'});
    chrome.runtime.sendMessage({action:'parallel-native-fallback',url:data.url}).catch(()=>{});
  }
}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(message?.target!=='parallel-offscreen')return;
  (async()=>{
    const w=ensureWorker();
    if(message.action==='start-parallel'){
      const saved=(await chrome.storage.local.get(JOB_KEY))[JOB_KEY];
      await saveStatus({state:'starting',message:'Preparando download paralelo…'});
      w.postMessage({type:'start',url:message.url,job:saved||null});
    }else if(message.action==='pause-parallel'){
      w.postMessage({type:'pause'});await saveStatus({state:'paused',message:'Pausado. As partes concluídas foram preservadas.'});
    }else if(message.action==='discard-parallel'){
      w.postMessage({type:'pause'});
      const root=await navigator.storage.getDirectory();
      await root.removeEntry('parallel-v1',{recursive:true}).catch(error=>{if(error.name!=='NotFoundError')throw error;});
      await chrome.storage.local.remove([JOB_KEY,STATUS_KEY]);await saveStatus({state:'idle',message:'Partes e link removidos.'});
    }
    reply({ok:true});
  })().catch(error=>reply({error:error.message||'Falha no serviço de transferência.'}));
  return true;
});
