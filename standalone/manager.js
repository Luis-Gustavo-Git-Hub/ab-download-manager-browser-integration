const labels = { queued:'Na fila', starting:'Iniciando', downloading:'Baixando', paused:'Pausado', interrupted:'Interrompido', failed:'Falhou', cancelled:'Cancelado', complete:'Concluído' };
const nodes = document.querySelector('#tasks');
let busy = false;
const previous = new Map();
function bytes(value) { return value == null ? 'tamanho desconhecido' : (value / 1048576).toFixed(1) + ' MB'; }
async function send(action, extra = {}) {
  const response = await chrome.runtime.sendMessage({ action, ...extra });
  if (!response || response.error) throw new Error(response?.error || 'Background indisponível.');
  return response.tasks;
}
async function act(action, extra) {
  try { render(await send(action, extra)); document.querySelector('#message').textContent = ''; return true; }
  catch (e) { document.querySelector('#message').textContent = e.message; return false; }
}
function render(tasks) {
  nodes.replaceChildren();
  if (!tasks.length) nodes.textContent = 'Sua lista está vazia.';
  for (const task of tasks) {
    const article = document.createElement('article');
    const title = document.createElement('h2'); title.textContent = task.name;
    const detail = document.createElement('p'); detail.className = 'detail';
    const last = previous.get(task.id), now = Date.now();
    const speed = last && task.status === 'downloading' ? Math.max(0, (task.bytes-last.bytes) * 1000/(now-last.time)) : 0;
    previous.set(task.id, {bytes:task.bytes, time:now});
    detail.textContent = (labels[task.status] || task.status) + ' · ' + bytes(task.bytes) + ' / ' + bytes(task.total) + (speed ? ' · ' + bytes(speed) + '/s' : '') + (task.error ? ' · '+task.error : '');
    const progress = document.createElement('progress'); progress.setAttribute('aria-label', 'Progresso de '+task.name);
    if (task.total) { progress.max=task.total; progress.value=task.bytes; }
    const actions = document.createElement('div'); actions.className='actions';
    function button(text, action) { const b=document.createElement('button'); b.textContent=text; b.onclick=()=>act(action,{id:task.id}); actions.append(b); }
    if (task.status==='downloading') button('Pausar','pause');
    if (task.canResume && ['paused','interrupted'].includes(task.status)) button('Retomar','resume');
    if (['failed','interrupted'].includes(task.status) && task.url) button('Reiniciar','retry');
    if (!['complete','failed','cancelled'].includes(task.status)) button('Cancelar','cancel');
    if (task.status==='queued') button('Priorizar','up');
    if (['complete','failed','cancelled'].includes(task.status)) button('Remover do histórico','remove');
    article.append(title,detail,progress,actions); nodes.append(article);
  }
}
document.querySelector('#add').onsubmit=async event=>{event.preventDefault();const input=document.querySelector('#url');if(await act('add',{url:input.value.trim()})) input.value='';};
document.querySelector('#clear').onclick=()=>act('clear');
document.querySelector('#expand').onclick=()=>chrome.runtime.openOptionsPage();
async function tick(){if(busy)return;busy=true;try{await act('list');}finally{busy=false;}}
tick();setInterval(tick,1500);
