/* Native mode: Chrome owns transfer, disk writes and file completion. */
const KEY = 'independent-v1';
const MAX_ACTIVE = 2;
const terminal = new Set(['complete', 'cancelled', 'failed']);
let chain = Promise.resolve();
let creatingOffscreen;
function serial(fn) {
  const next = chain.then(fn);
  chain = next.catch(() => {});
  return next;
}
async function read() {
  const result = await chrome.storage.local.get(KEY);
  const state = result[KEY] || { version: 1, tasks: [] };
  if (state.version !== 1 || !Array.isArray(state.tasks)) throw new Error('Dados locais incompatíveis.');
  return state;
}
const save = state => chrome.storage.local.set({ [KEY]: state });
function validUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Informe um link HTTP ou HTTPS sem credenciais no endereço.');
  }
  return url.href;
}
async function ensureParallelDocument() {
  const url=chrome.runtime.getURL('offscreen.html');
  const contexts=await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT'],documentUrls:[url]});
  if(contexts.length)return;
  if(!creatingOffscreen)creatingOffscreen=chrome.offscreen.createDocument({url:'offscreen.html',reasons:['WORKERS'],justification:'Manter um worker de transferência ativo quando o popup da extensão for fechado.'}).finally(()=>{creatingOffscreen=null;});
  await creatingOffscreen;
}
function apply(task, item) {
  task.bytes = item.bytesReceived;
  task.total = item.totalBytes > 0 ? item.totalBytes : null;
  task.name = item.filename.split(/[\\/]/).pop() || task.name;
  task.canResume = item.canResume;
  task.status = item.state === 'complete' ? 'complete' : item.state === 'interrupted'
    ? (task.status === 'cancelled' ? 'cancelled' : 'interrupted') : item.paused ? 'paused' : 'downloading';
  task.error = item.error || null;
  if (task.status === 'complete') delete task.url;
}
async function reconcile(state) {
  for (const task of state.tasks) {
    if (task.nativeId == null) {
      // A worker may stop after starting Chrome's download but before saving its ID.
      // Do not guess which browser download belongs to this task or start a duplicate.
      if (task.status === 'starting') {
        task.status = 'interrupted';
        task.error = 'Início interrompido. Confira os downloads do navegador antes de reiniciar.';
      }
      continue;
    }
    const [item] = await chrome.downloads.search({ id: task.nativeId });
    if (item) apply(task, item);
    else if (!terminal.has(task.status)) {
      task.status = 'failed'; task.error = 'Download removido do navegador.';
    }
  }
}
async function pump(state) {
  let active = state.tasks.filter(t => ['downloading', 'starting'].includes(t.status)).length;
  for (const task of state.tasks) {
    if (active >= MAX_ACTIVE) break;
    if (task.status !== 'queued') continue;
    task.status = 'starting';
    await save(state);
    try {
      task.nativeId = await chrome.downloads.download({ url: task.url, conflictAction: 'uniquify', saveAs: false });
      task.status = 'downloading'; active++;
    } catch {
      task.status = 'failed'; task.error = 'O navegador não conseguiu iniciar. Confira o link e tente novamente.';
    }
    await save(state);
  }
}
async function refresh() {
  const state = await read();
  await reconcile(state); await save(state); await pump(state);
  return state;
}
async function command(message) {
  const state = await refresh();
  if (message.action === 'list') return state.tasks;
  if (message.action === 'add') {
    const url = validUrl(message.url);
    if (state.tasks.some(t => t.url === url && !terminal.has(t.status))) throw new Error('Este link já está na lista.');
    if (state.tasks.length >= 500) throw new Error('Limpe o histórico para adicionar mais downloads.');
    state.tasks.push({ id: crypto.randomUUID(), url, name: 'Download', status: 'queued', bytes: 0, total: null, created: Date.now() });
  } else if (message.action === 'clear') {
    state.tasks = state.tasks.filter(t => !terminal.has(t.status));
  } else {
    const task = state.tasks.find(t => t.id === message.id);
    if (!task) throw new Error('Download não encontrado.');
    if (message.action === 'pause' && task.status === 'downloading') {
      await chrome.downloads.pause(task.nativeId); task.status = 'paused';
    } else if (message.action === 'resume' && task.canResume && ['paused', 'interrupted'].includes(task.status)) {
      if (state.tasks.filter(t => t.status === 'downloading').length >= MAX_ACTIVE) throw new Error('Aguarde uma vaga na fila.');
      await chrome.downloads.resume(task.nativeId); task.status = 'downloading';
    } else if (message.action === 'cancel' && !terminal.has(task.status)) {
      if (task.nativeId != null) {
        const [item] = await chrome.downloads.search({ id: task.nativeId });
        if (item?.state === 'in_progress') await chrome.downloads.cancel(task.nativeId);
      }
      task.status = 'cancelled'; delete task.url;
    } else if (message.action === 'remove' && !['downloading', 'starting'].includes(task.status)) {
      state.tasks = state.tasks.filter(t => t.id !== task.id);
    } else if (message.action === 'retry' && ['failed', 'interrupted'].includes(task.status) && task.url) {
      // Native API does not expose a portable atomic restart. Require explicit cancellation first.
      if (task.nativeId != null) {
        const [item] = await chrome.downloads.search({ id: task.nativeId });
        if (item?.state === 'in_progress') await chrome.downloads.cancel(task.nativeId);
      }
      delete task.nativeId; task.status = 'queued'; task.error = null;
    } else if (message.action === 'up' && task.status === 'queued') {
      const index = state.tasks.indexOf(task);
      if (index > 0) { state.tasks.splice(index, 1); state.tasks.unshift(task); }
    } else throw new Error('Ação indisponível para este download.');
  }
  await save(state); await pump(state);
  return state.tasks;
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  const base = chrome.runtime.getURL('');
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(base) || sender.tab && !sender.tab.url?.startsWith(base)) return;
  if (!message || typeof message.action !== 'string') return;
  if (message.target === 'parallel-offscreen') return;
  if (message.action === 'start-parallel' || message.action === 'pause-parallel' || message.action === 'discard-parallel') {
    (async () => {
      await ensureParallelDocument();
      await chrome.runtime.sendMessage({target:'parallel-offscreen', action:message.action, url:message.url});
      reply({ok:true});
    })().catch(error => reply({error:error.message || 'Não foi possível iniciar a transferência em segundo plano.'}));
    return true;
  }
  if (message.action === 'parallel-native-fallback') {
    const url = validUrl(message.url);
    chrome.downloads.download({url, conflictAction:'uniquify', saveAs:false}).then(id => reply({ok:true,id}), error => reply({error:error.message || 'Não foi possível iniciar o download padrão.'}));
    return true;
  }
  serial(() => command(message)).then(tasks => reply({ tasks }), error => reply({ error: error.message || 'Não foi possível concluir.' }));
  return true;
});
chrome.downloads.onChanged.addListener(() => serial(refresh).catch(() => {}));
chrome.downloads.onErased.addListener(() => serial(refresh).catch(() => {}));
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'recover') serial(refresh).catch(() => {}); });
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get('parallel-status-v1').then(result => {
    const status = result['parallel-status-v1'];
    if (status && ['starting','downloading'].includes(status.state)) {
      return chrome.storage.local.set({'parallel-status-v1':{...status,state:'interrupted',message:'O navegador reiniciou. Reabra o popup e toque em Retomar para revalidar as partes concluídas.'}});
    }
  }).catch(() => {});
  serial(refresh).catch(() => {});
});
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => chrome.contextMenus.create({ id: 'independent-download', title: 'Baixar com Downloads Independentes', contexts: ['link'], targetUrlPatterns: ['http://*/*', 'https://*/*'] }));
  chrome.alarms.create('recover', { periodInMinutes: 1 });
  serial(refresh).catch(() => {});
});
chrome.contextMenus.onClicked.addListener(info => {
  if (info.menuItemId === 'independent-download' && info.linkUrl) serial(() => command({ action: 'add', url: info.linkUrl })).catch(() => chrome.runtime.openOptionsPage());
});
