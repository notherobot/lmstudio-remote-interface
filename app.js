// === State ===
const state = {
  apiBase: '',
  connected: false,
  messages: [],
  streaming: false,
  abortController: null,
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

// === Init ===
function init() {
  loadSettings();
  setupListeners();
  autoGrow();

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
    }

    setStatus('connected');
    updateSendBtn();
  } catch (err) {
    setStatus('disconnected');
    state.connected = false;
    modelSelect.innerHTML = '<option value="">Offline</option>';
    modelSelect.disabled = true;
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
    showSetupError('Could not connect. Check the URL and make sure LM Studio\'s server is running with CORS enabled.');
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
  userInput.focus();
}

function showSetup() {
  state.connected = false;
  state.messages = [];
  state.apiBase = '';
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
    bubble.innerHTML = renderMarkdown(content);
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

function renderMarkdown(text) {
  if (typeof marked !== 'undefined') {
    return marked.parse(text, { breaks: true });
  }
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
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
  if (!text || !state.connected) return;

  state.messages.push({ role: 'user', content: text });
  addMessage('user', text);
  userInput.value = '';
  autoGrow();
  updateSendBtn();

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
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              bubble.innerHTML = renderMarkdown(fullContent);
              addCopyButtons(bubble);
              scrollToBottom();
            }
          } catch(e) { /* skip */ }
        }
      }
    } else {
      const data = await resp.json();
      fullContent = data.choices?.[0]?.message?.content || '(empty response)';
      bubble.innerHTML = renderMarkdown(fullContent);
      addCopyButtons(bubble);
      scrollToBottom();
    }

    state.messages.push({ role: 'assistant', content: fullContent });

  } catch (err) {
    if (err.name === 'AbortError') {
      if (fullContent) {
        state.messages.push({ role: 'assistant', content: fullContent });
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
  messagesEl.innerHTML = '';
  if (welcome) { welcome.style.display = ''; messagesEl.appendChild(welcome); }
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
  userInput.style.height = Math.min(userInput.scrollHeight, 150) + 'px';
}

function updateSendBtn() {
  sendBtn.disabled = !userInput.value.trim() || !state.connected;
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
