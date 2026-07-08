// === Version ===
const APP_VERSION = 'v0.0.5';

// === State ===
const state = {
  apiBase: '',
  connected: false,
  messages: [],
  streaming: false,
  abortController: null,
  currentModel: null,
  modelCaps: { vision: false },
  attachments: [],       // pending uploads: { kind:'image'|'file', name, size, url?, text? }
  sessions: [],          // saved chat sessions
  currentSessionId: null,
};

// === DOM ===
const $ = (sel) => document.querySelector(sel);
const setup          = $('#setup');
const setupUrl       = $('#setup-url');
const setupConnect   = $('#setup-connect');
const setupError     = $('#setup-error');
const useLocalhost   = $('#use-localhost');

const headerEl       = $('#header');
const chatContainer  = $('#chat-container');
const inputArea      = $('#input-area');
const statusDot      = $('#status-indicator');
const modelSelect    = $('#model-select');
const newChatBtn     = $('#new-chat-btn');

const sidebarToggle  = $('#sidebar-toggle');
const sidebar        = $('#sidebar');
const sidebarOverlay = $('#sidebar-overlay');
const sidebarClose   = $('#sidebar-close');
const sidebarUrl     = $('#sidebar-url');
const sidebarReconn  = $('#sidebar-reconnect');
const disconnectBtn  = $('#disconnect-btn');
const systemPrompt   = $('#system-prompt');
const tempSlider     = $('#temperature');
const tempValue      = $('#temp-value');
const tokensSlider   = $('#max-tokens');
const tokensValue    = $('#tokens-value');
const streamToggle   = $('#stream-toggle');

const messagesEl     = $('#messages');
const welcome        = $('#welcome');
const userInput      = $('#user-input');
const sendBtn        = $('#send-btn');
const stopBtn        = $('#stop-btn');

const attachImageBtn = $('#attach-image-btn');
const attachFileBtn  = $('#attach-file-btn');
const imageInput     = $('#image-input');
const fileInput      = $('#file-input');
const attachmentsEl  = $('#attachments');

const historyBtn     = $('#history-btn');
const historyPanel   = $('#history-panel');
const historyOverlay = $('#history-overlay');
const historyClose   = $('#history-close');
const historyNew     = $('#history-new');
const historyList    = $('#history-list');
const historyEmpty   = $('#history-empty');

// === Init ===
function init() {
  document.querySelectorAll('.app-version').forEach(el => el.textContent = APP_VERSION);
  loadSettings();
  loadSessions();
  setupListeners();

  // If we have a saved URL, skip setup and connect
  const savedUrl = localStorage.getItem('lmstudio-server-url');
  if (savedUrl) {
    state.apiBase = savedUrl;
    sidebarUrl.value = savedUrl;
    showChat();
    connect();
  }
}

// === Settings ===
function loadSettings() {
  const saved = localStorage.getItem('lmstudio-chat-settings');
  if (!saved) return;
  try {
    const s = JSON.parse(saved);
    systemPrompt.value = s.systemPrompt || '';
    tempSlider.value = s.temperature ?? 0.7;
    tokensSlider.value = s.maxTokens ?? 2048;
    streamToggle.checked = s.stream ?? true;
    tempValue.textContent = tempSlider.value;
    tokensValue.textContent = tokensSlider.value;
  } catch(e) { /* ignore */ }
}

function saveSettings() {
  localStorage.setItem('lmstudio-chat-settings', JSON.stringify({
    systemPrompt: systemPrompt.value,
    temperature: parseFloat(tempSlider.value),
    maxTokens: parseInt(tokensSlider.value),
    stream: streamToggle.checked,
  }));
}

// === Connection ===
function normalizeUrl(raw) {
  let url = raw.trim();
  if (!url) return '';
  url = url.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) {
    url = 'http://' + url;
  }
  return url;
}

async function connect() {
  setStatus('connecting');

  try {
    const resp = await fetch(state.apiBase + '/v1/models', {
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const data = await resp.json();
    state.connected = true;

    const prevModel = state.currentModel;
    modelSelect.innerHTML = '';
    modelSelect.disabled = false;
    const models = data.data || [];
    if (models.length === 0) {
      modelSelect.innerHTML = '<option value="">No models loaded</option>';
    } else {
      models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.id;
        modelSelect.appendChild(opt);
      });
      // Preserve the previously active model across reconnects if still available
      if (prevModel && models.some(m => m.id === prevModel)) {
        modelSelect.value = prevModel;
      }
    }
    // Track the active model silently (no notification on initial connect/reconnect)
    state.currentModel = modelSelect.value || null;
    refreshModelCaps();

    setStatus('connected');
    updateSendBtn();
  } catch (err) {
    setStatus('disconnected');
    state.connected = false;
    modelSelect.innerHTML = '<option value="">Offline</option>';
    modelSelect.disabled = true;
    state.modelCaps.vision = false;
    attachImageBtn.classList.add('hidden');
    // Retry silently
    setTimeout(connect, 5000);
  }
}

async function tryConnect(rawUrl) {
  const base = normalizeUrl(rawUrl);
  if (!base) {
    showSetupError('Enter a URL');
    return false;
  }

  setupConnect.disabled = true;
  setupConnect.textContent = 'Connecting...';
  setupError.classList.add('hidden');

  try {
    const resp = await fetch(base + '/v1/models', {
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    await resp.json();

    // Success — save and enter chat
    state.apiBase = base;
    localStorage.setItem('lmstudio-server-url', base);
    sidebarUrl.value = rawUrl.trim();
    showChat();
    connect();
    return true;
  } catch (err) {
    showSetupError('Could not connect. Make sure LM Studio\'s server is running, CORS is enabled, and Tailscale is active on both devices.');
    return false;
  } finally {
    setupConnect.disabled = false;
    setupConnect.textContent = 'Connect';
  }
}

function showSetupError(msg) {
  setupError.textContent = msg;
  setupError.classList.remove('hidden');
}

function setStatus(s) {
  statusDot.className = 'status ' + s;
}

// === Views ===
function showChat() {
  setup.classList.add('hidden');
  headerEl.classList.remove('hidden');
  chatContainer.classList.remove('hidden');
  inputArea.classList.remove('hidden');
  autoGrow(); // size the textarea now that it's visible (avoids a collapsed/cropped field)
  userInput.focus();
}

function showSetup() {
  state.connected = false;
  state.messages = [];
  state.apiBase = '';
  state.currentSessionId = null;
  state.modelCaps.vision = false;
  clearAttachments();
  attachImageBtn.classList.add('hidden');
  localStorage.removeItem('lmstudio-server-url');
  setStatus('disconnected');
  modelSelect.innerHTML = '<option value="">Offline</option>';
  modelSelect.disabled = true;
  messagesEl.innerHTML = '';
  if (welcome) { welcome.style.display = ''; messagesEl.appendChild(welcome); }

  setup.classList.remove('hidden');
  headerEl.classList.add('hidden');
  chatContainer.classList.add('hidden');
  inputArea.classList.add('hidden');
  setupUrl.value = '';
  setupError.classList.add('hidden');
  setupUrl.focus();
}

// === Chat ===
function hideWelcome() {
  if (welcome) welcome.style.display = 'none';
}

function addMessage(role, content, isError) {
  hideWelcome();
  const wrap = document.createElement('div');
  wrap.className = `message ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = role === 'user' ? 'You' : 'AI';

  const body = document.createElement('div');
  body.className = 'message-body';

  const bubble = document.createElement('div');
  bubble.className = 'message-content' + (isError ? ' error' : '');

  if (role === 'assistant' && !isError) {
    bubble.innerHTML = renderMessage(content);
  } else {
    bubble.textContent = content;
  }

  body.appendChild(bubble);
  wrap.appendChild(avatar);
  wrap.appendChild(body);
  messagesEl.appendChild(wrap);
  addCopyButtons(bubble);
  scrollToBottom();
  return bubble;
}

function addUserMessage(text, attachments) {
  hideWelcome();
  const wrap = document.createElement('div');
  wrap.className = 'message user';

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = 'You';

  const body = document.createElement('div');
  body.className = 'message-body';

  const bubble = document.createElement('div');
  bubble.className = 'message-content';

  if (attachments && attachments.length) {
    const strip = document.createElement('div');
    strip.className = 'message-attachments';
    attachments.forEach(att => {
      if (att.kind === 'image') {
        const img = document.createElement('img');
        img.src = att.url;
        img.alt = att.name || 'image';
        strip.appendChild(img);
      } else {
        const chip = document.createElement('span');
        chip.className = 'message-file-chip';
        chip.innerHTML = FILE_SVG;
        const name = document.createElement('span');
        name.textContent = att.name || 'file';
        chip.appendChild(name);
        strip.appendChild(chip);
      }
    });
    bubble.appendChild(strip);
  }

  if (text) {
    const t = document.createElement('div');
    t.className = 'message-text';
    t.textContent = text;
    bubble.appendChild(t);
  }

  body.appendChild(bubble);
  wrap.appendChild(avatar);
  wrap.appendChild(body);
  messagesEl.appendChild(wrap);
  scrollToBottom();
}

// Render a stored message (from a loaded session) back into the chat.
function renderStoredMessage(msg) {
  if (msg.role === 'assistant') {
    addMessage('assistant', typeof msg.content === 'string' ? msg.content : extractText(msg.content));
    return;
  }
  let text = '';
  const attachments = [];
  if (typeof msg.content === 'string') {
    text = msg.content;
  } else if (Array.isArray(msg.content)) {
    msg.content.forEach(part => {
      if (part.type === 'text') text += (text ? '\n' : '') + part.text;
      else if (part.type === 'image_url') attachments.push({ kind: 'image', name: 'image', url: part.image_url?.url });
    });
  }
  addUserMessage(text, attachments);
}

function addModelDivider(modelId) {
  hideWelcome();
  const divider = document.createElement('div');
  divider.className = 'model-divider';
  const label = document.createElement('span');
  label.textContent = `${modelId} loaded`;
  divider.appendChild(label);
  messagesEl.appendChild(divider);
  scrollToBottom();
}

function onModelChange() {
  const selected = modelSelect.value;
  if (!selected || selected === state.currentModel) return;
  state.currentModel = selected;
  addModelDivider(selected);
  refreshModelCaps();
}

// Guess vision support from the model name — used as a fallback when LM Studio's
// richer /api/v0 endpoint isn't available.
function nameSuggestsVision(modelId) {
  const id = (modelId || '').toLowerCase();
  const patterns = [
    'vl', 'vlm', 'vision', 'llava', 'bakllava', 'pixtral', 'moondream',
    'minicpm-v', 'internvl', 'smolvlm', 'cogvlm', 'glm-4v', 'yi-vl',
    'deepseek-vl', 'janus', 'molmo', 'aria', 'ovis', 'idefics', 'fuyu',
    'gemma-3', 'gemma3', 'llama-3.2-11b', 'llama-3.2-90b', 'llama4', 'llama-4',
    'phi-3-vision', 'phi-3.5-vision', 'phi-4-multimodal', 'mistral-small-3.1',
    'kimi-vl', 'qwen2-vl', 'qwen2.5-vl', 'qwen3-vl'
  ];
  return patterns.some(p => id.includes(p));
}

// Detect capabilities of the active model and show/hide the image button.
async function refreshModelCaps() {
  const model = modelSelect.value;
  let vision = nameSuggestsVision(model);

  // Prefer LM Studio's native API, which reports model type ("vlm" = vision).
  try {
    const resp = await fetch(state.apiBase + '/api/v0/models', { signal: AbortSignal.timeout(4000) });
    if (resp.ok) {
      const data = await resp.json();
      const entry = (data.data || []).find(m => m.id === model);
      if (entry && typeof entry.type === 'string') {
        vision = entry.type.toLowerCase() === 'vlm';
      }
    }
  } catch (e) { /* endpoint unavailable — keep the name-based guess */ }

  state.modelCaps.vision = vision;
  attachImageBtn.classList.toggle('hidden', !vision);

  // Drop any pending image attachments if the new model can't see them
  if (!vision && state.attachments.some(a => a.kind === 'image')) {
    state.attachments = state.attachments.filter(a => a.kind !== 'image');
    renderAttachments();
    updateSendBtn();
  }
}

function renderMarkdown(text) {
  if (typeof marked !== 'undefined') {
    return marked.parse(text, { breaks: true });
  }
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

// Wrap reasoning ("thinking") in a collapsed <details> dropdown, leaving the
// answer rendered normally. Handles <think>/<thinking> tags, including a
// still-open block mid-stream.
function renderMessage(text) {
  const THINK_RE = /<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi;
  let html = '';
  let lastIndex = 0;
  let m;
  while ((m = THINK_RE.exec(text)) !== null) {
    const before = text.slice(lastIndex, m.index);
    if (before.trim()) html += renderMarkdown(before);
    html += thinkBlock(m[1], false);
    lastIndex = THINK_RE.lastIndex;
  }

  const rest = text.slice(lastIndex);
  const openIdx = rest.search(/<think(?:ing)?>/i);
  if (openIdx !== -1) {
    // An unclosed reasoning block — everything after it is still-streaming thought
    const before = rest.slice(0, openIdx);
    if (before.trim()) html += renderMarkdown(before);
    const inner = rest.slice(openIdx).replace(/^<think(?:ing)?>/i, '');
    html += thinkBlock(inner, true);
  } else if (rest.trim()) {
    html += renderMarkdown(rest);
  }

  return html || renderMarkdown(text);
}

function thinkBlock(inner, streaming) {
  const trimmed = inner.trim();
  const body = trimmed ? renderMarkdown(trimmed) : '<em>Thinking…</em>';
  const label = streaming ? 'Thinking…' : 'Thought process';
  return `<details class="think-block"><summary>${label}</summary><div class="think-content">${body}</div></details>`;
}

function addCopyButtons(el) {
  el.querySelectorAll('pre').forEach(pre => {
    if (pre.querySelector('.copy-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.textContent = 'Copy';
    btn.addEventListener('click', () => {
      const code = pre.querySelector('code');
      navigator.clipboard.writeText(code ? code.textContent : pre.textContent);
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = 'Copy', 1500);
    });
    pre.appendChild(btn);
  });
}

function scrollToBottom() {
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

async function sendMessage() {
  const text = userInput.value.trim();
  const attachments = state.attachments;
  if ((!text && attachments.length === 0) || !state.connected || state.streaming) return;

  const content = buildApiContent(text, attachments);
  state.messages.push({ role: 'user', content });
  addUserMessage(text, attachments);
  userInput.value = '';
  clearAttachments();
  autoGrow();
  updateSendBtn();
  saveCurrentSession();

  const apiMessages = [];
  const sys = systemPrompt.value.trim();
  if (sys) apiMessages.push({ role: 'system', content: sys });
  apiMessages.push(...state.messages);

  const useStream = streamToggle.checked;
  state.streaming = true;
  state.abortController = new AbortController();
  sendBtn.classList.add('hidden');
  stopBtn.classList.remove('hidden');

  hideWelcome();
  const wrap = document.createElement('div');
  wrap.className = 'message assistant';
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = 'AI';
  const body = document.createElement('div');
  body.className = 'message-body';
  const bubble = document.createElement('div');
  bubble.className = 'message-content';
  bubble.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
  body.appendChild(bubble);
  wrap.appendChild(avatar);
  wrap.appendChild(body);
  messagesEl.appendChild(wrap);
  scrollToBottom();

  let fullContent = '';
  let reasoning = '';

  // Combine separate reasoning (LM Studio's reasoning_content) with the answer
  // so renderMessage can wrap it as a collapsible block. Inline <think> tags
  // already live inside fullContent and are handled there.
  const withReasoning = () =>
    reasoning ? `<think>${reasoning}</think>${fullContent}` : fullContent;

  try {
    const resp = await fetch(state.apiBase + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelSelect.value || undefined,
        messages: apiMessages,
        temperature: parseFloat(tempSlider.value),
        max_tokens: parseInt(tokensSlider.value),
        stream: useStream,
      }),
      signal: state.abortController.signal,
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`HTTP ${resp.status}: ${errText || resp.statusText}`);
    }

    if (useStream) {
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;

          try {
            const chunk = JSON.parse(data);
            const delta = chunk.choices?.[0]?.delta || {};
            let changed = false;
            if (delta.reasoning_content) { reasoning += delta.reasoning_content; changed = true; }
            if (delta.content) { fullContent += delta.content; changed = true; }
            if (changed) {
              bubble.innerHTML = renderMessage(withReasoning());
              addCopyButtons(bubble);
              scrollToBottom();
            }
          } catch(e) { /* skip */ }
        }
      }
    } else {
      const data = await resp.json();
      const msg = data.choices?.[0]?.message || {};
      reasoning = msg.reasoning_content || '';
      fullContent = msg.content || '(empty response)';
      bubble.innerHTML = renderMessage(withReasoning());
      addCopyButtons(bubble);
      scrollToBottom();
    }

    state.messages.push({ role: 'assistant', content: fullContent });
    saveCurrentSession();

  } catch (err) {
    if (err.name === 'AbortError') {
      if (fullContent) {
        state.messages.push({ role: 'assistant', content: fullContent });
        saveCurrentSession();
      } else {
        bubble.innerHTML = '<em>Stopped.</em>';
      }
    } else {
      bubble.className = 'message-content error';
      bubble.textContent = err.message;
      state.connected = false;
      setStatus('disconnected');
      setTimeout(connect, 3000);
    }
  } finally {
    state.streaming = false;
    state.abortController = null;
    sendBtn.classList.remove('hidden');
    stopBtn.classList.add('hidden');
    updateSendBtn();
    scrollToBottom();
  }
}

function stopStreaming() {
  if (state.abortController) state.abortController.abort();
}

function newChat() {
  state.messages = [];
  state.currentSessionId = null;
  clearAttachments();
  messagesEl.innerHTML = '';
  if (welcome) { welcome.style.display = ''; messagesEl.appendChild(welcome); }
  renderHistoryList();
  if (!inputArea.classList.contains('hidden')) userInput.focus();
}

// === Chat sessions ===
const SESSIONS_KEY = 'lmstudio-chat-sessions';

function loadSessions() {
  try {
    state.sessions = JSON.parse(localStorage.getItem(SESSIONS_KEY)) || [];
  } catch (e) {
    state.sessions = [];
  }
  renderHistoryList();
}

function persistSessions() {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(state.sessions));
  } catch (e) {
    // localStorage quota exceeded (large images) — drop oldest sessions until it fits
    while (state.sessions.length > 1) {
      state.sessions.pop();
      try {
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(state.sessions));
        return;
      } catch (e2) { /* keep trimming */ }
    }
  }
}

function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter(p => p.type === 'text').map(p => p.text).join(' ');
  return '';
}

function sessionTitle(messages) {
  const firstUser = messages.find(m => m.role === 'user');
  if (!firstUser) return 'New chat';
  const text = extractText(firstUser.content).trim().replace(/\s+/g, ' ');
  return text ? text.slice(0, 60) : 'Attachment';
}

function saveCurrentSession() {
  if (state.messages.length === 0) return;
  const now = Date.now();
  let session = state.sessions.find(s => s.id === state.currentSessionId);
  if (!session) {
    session = { id: 'c' + now.toString(36) + Math.random().toString(36).slice(2, 7), createdAt: now };
    state.currentSessionId = session.id;
  }
  session.messages = state.messages;
  session.title = sessionTitle(state.messages);
  session.model = state.currentModel;
  session.updatedAt = now;
  // Keep the active session at the top, newest-first
  state.sessions = [session, ...state.sessions.filter(s => s.id !== session.id)];
  persistSessions();
  renderHistoryList();
}

function loadSession(id) {
  const session = state.sessions.find(s => s.id === id);
  if (!session) return;
  if (state.streaming) stopStreaming();
  state.currentSessionId = id;
  state.messages = JSON.parse(JSON.stringify(session.messages || []));
  clearAttachments();

  messagesEl.innerHTML = '';
  if (welcome) { welcome.style.display = 'none'; messagesEl.appendChild(welcome); }
  state.messages.forEach(renderStoredMessage);
  scrollToBottom();

  closeHistory();
  renderHistoryList();
}

function deleteSession(id) {
  state.sessions = state.sessions.filter(s => s.id !== id);
  persistSessions();
  if (state.currentSessionId === id) newChat();
  else renderHistoryList();
}

function relTime(ts) {
  if (!ts) return '';
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  const d = Math.floor(h / 24);
  if (d < 7) return d + 'd ago';
  return new Date(ts).toLocaleDateString();
}

const TRASH_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';

function renderHistoryList() {
  if (!historyList) return;
  historyList.innerHTML = '';
  if (!state.sessions.length) {
    historyEmpty.classList.remove('hidden');
    return;
  }
  historyEmpty.classList.add('hidden');

  state.sessions.forEach(session => {
    const li = document.createElement('li');
    li.className = 'history-item' + (session.id === state.currentSessionId ? ' active' : '');

    const main = document.createElement('div');
    main.className = 'history-item-main';
    const title = document.createElement('div');
    title.className = 'history-item-title';
    title.textContent = session.title || 'New chat';
    const time = document.createElement('div');
    time.className = 'history-item-time';
    time.textContent = relTime(session.updatedAt);
    main.appendChild(title);
    main.appendChild(time);
    main.addEventListener('click', () => loadSession(session.id));

    const del = document.createElement('button');
    del.className = 'history-delete';
    del.setAttribute('aria-label', 'Delete chat');
    del.innerHTML = TRASH_SVG;
    del.addEventListener('click', e => { e.stopPropagation(); deleteSession(session.id); });

    li.appendChild(main);
    li.appendChild(del);
    historyList.appendChild(li);
  });
}

function openHistory() {
  renderHistoryList();
  historyPanel.classList.remove('hidden');
  historyOverlay.classList.remove('hidden');
}

function closeHistory() {
  historyPanel.classList.add('hidden');
  historyOverlay.classList.add('hidden');
}

// === Sidebar ===
function openSidebar() {
  sidebar.classList.remove('hidden');
  sidebarOverlay.classList.remove('hidden');
}

function closeSidebar() {
  sidebar.classList.add('hidden');
  sidebarOverlay.classList.add('hidden');
}

// === Input ===
function autoGrow() {
  userInput.style.height = 'auto';
  // scrollHeight is 0 when the field is hidden; don't collapse the box in that case
  if (userInput.scrollHeight > 0) {
    userInput.style.height = Math.min(userInput.scrollHeight, 150) + 'px';
  }
}

function updateSendBtn() {
  const hasInput = userInput.value.trim() || state.attachments.length > 0;
  sendBtn.disabled = !hasInput || !state.connected || state.streaming;
}

// === Attachments ===
const MAX_FILE_BYTES = 1024 * 1024; // 1 MB per text file

function readFile(file, asDataUrl) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    if (asDataUrl) reader.readAsDataURL(file);
    else reader.readAsText(file);
  });
}

async function handleImageFiles(files) {
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    try {
      const url = await readFile(file, true);
      state.attachments.push({ kind: 'image', name: file.name, size: file.size, url });
    } catch (e) { /* skip unreadable file */ }
  }
  renderAttachments();
  updateSendBtn();
}

async function handleTextFiles(files) {
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      alert(`"${file.name}" is larger than 1 MB and was skipped.`);
      continue;
    }
    try {
      const text = await readFile(file, false);
      state.attachments.push({ kind: 'file', name: file.name, size: file.size, text });
    } catch (e) { /* skip unreadable file */ }
  }
  renderAttachments();
  updateSendBtn();
}

function removeAttachment(idx) {
  state.attachments.splice(idx, 1);
  renderAttachments();
  updateSendBtn();
}

function clearAttachments() {
  state.attachments = [];
  renderAttachments();
}

function formatBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

const FILE_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';

function renderAttachments() {
  attachmentsEl.innerHTML = '';
  if (state.attachments.length === 0) {
    attachmentsEl.classList.add('hidden');
    return;
  }
  attachmentsEl.classList.remove('hidden');

  state.attachments.forEach((att, idx) => {
    const chip = document.createElement('div');
    chip.className = 'attachment-chip' + (att.kind === 'image' ? ' image' : '');

    if (att.kind === 'image') {
      const img = document.createElement('img');
      img.src = att.url;
      img.alt = att.name;
      chip.appendChild(img);
    } else {
      const icon = document.createElement('span');
      icon.className = 'file-icon';
      icon.innerHTML = FILE_SVG;
      const meta = document.createElement('div');
      meta.className = 'file-meta';
      const name = document.createElement('div');
      name.className = 'file-name';
      name.textContent = att.name;
      const size = document.createElement('div');
      size.className = 'file-size';
      size.textContent = formatBytes(att.size);
      meta.appendChild(name);
      meta.appendChild(size);
      chip.appendChild(icon);
      chip.appendChild(meta);
    }

    const remove = document.createElement('button');
    remove.className = 'attachment-remove';
    remove.setAttribute('aria-label', 'Remove attachment');
    remove.textContent = '×';
    remove.addEventListener('click', () => removeAttachment(idx));
    chip.appendChild(remove);

    attachmentsEl.appendChild(chip);
  });
}

// Turn typed text + attachments into an API message content value.
// Returns a string for text-only, or an array of parts when images are present.
function buildApiContent(text, attachments) {
  const images = attachments.filter(a => a.kind === 'image');
  const files = attachments.filter(a => a.kind === 'file');

  let textPart = text || '';
  if (files.length) {
    const blocks = files.map(f => `\n\n[File: ${f.name}]\n\`\`\`\n${f.text}\n\`\`\``).join('');
    textPart = (textPart + blocks).trim();
  }

  if (images.length) {
    const parts = [];
    if (textPart) parts.push({ type: 'text', text: textPart });
    images.forEach(img => parts.push({ type: 'image_url', image_url: { url: img.url } }));
    return parts;
  }
  return textPart;
}

// === Events ===
function setupListeners() {
  // Setup screen
  setupConnect.addEventListener('click', () => tryConnect(setupUrl.value));
  setupUrl.addEventListener('keydown', e => {
    if (e.key === 'Enter') tryConnect(setupUrl.value);
  });
  useLocalhost.addEventListener('click', () => {
    setupUrl.value = 'localhost:1234';
    tryConnect('localhost:1234');
  });

  // Sidebar
  sidebarToggle.addEventListener('click', openSidebar);
  sidebarClose.addEventListener('click', closeSidebar);
  sidebarOverlay.addEventListener('click', closeSidebar);

  sidebarReconn.addEventListener('click', () => {
    const raw = sidebarUrl.value.trim();
    if (!raw) return;
    const base = normalizeUrl(raw);
    state.apiBase = base;
    state.connected = false;
    localStorage.setItem('lmstudio-server-url', base);
    connect();
    closeSidebar();
  });

  disconnectBtn.addEventListener('click', () => {
    closeSidebar();
    showSetup();
  });

  // Settings
  tempSlider.addEventListener('input', () => { tempValue.textContent = tempSlider.value; saveSettings(); });
  tokensSlider.addEventListener('input', () => { tokensValue.textContent = tokensSlider.value; saveSettings(); });
  systemPrompt.addEventListener('change', saveSettings);
  streamToggle.addEventListener('change', saveSettings);

  // Chat
  modelSelect.addEventListener('change', onModelChange);
  newChatBtn.addEventListener('click', newChat);
  userInput.addEventListener('input', () => { autoGrow(); updateSendBtn(); });
  userInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled && !state.streaming) sendMessage();
    }
  });
  sendBtn.addEventListener('click', () => { if (!state.streaming) sendMessage(); });
  stopBtn.addEventListener('click', stopStreaming);

  // Attachments
  attachImageBtn.addEventListener('click', () => imageInput.click());
  attachFileBtn.addEventListener('click', () => fileInput.click());
  imageInput.addEventListener('change', e => { handleImageFiles([...e.target.files]); e.target.value = ''; });
  fileInput.addEventListener('change', e => { handleTextFiles([...e.target.files]); e.target.value = ''; });
  userInput.addEventListener('paste', e => {
    if (!state.modelCaps.vision) return;
    const imgs = [...(e.clipboardData?.items || [])]
      .filter(it => it.kind === 'file' && it.type.startsWith('image/'))
      .map(it => it.getAsFile())
      .filter(Boolean);
    if (imgs.length) { e.preventDefault(); handleImageFiles(imgs); }
  });

  // History panel
  historyBtn.addEventListener('click', openHistory);
  historyClose.addEventListener('click', closeHistory);
  historyOverlay.addEventListener('click', closeHistory);
  historyNew.addEventListener('click', () => { newChat(); closeHistory(); });

  // Reconnect when tab becomes visible
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.apiBase && !state.connected && !state.streaming) connect();
  });
}

// === Service Worker ===
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// === Start ===
init();
