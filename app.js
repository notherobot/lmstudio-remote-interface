// === Config ===
const API_BASE = 'http://127.0.0.1:1234';

// === State ===
const state = {
  connected: false,
  messages: [],
  streaming: false,
  abortController: null,
};

// === DOM ===
const $ = (sel) => document.querySelector(sel);
const statusDot      = $('#status-indicator');
const modelSelect    = $('#model-select');
const newChatBtn     = $('#new-chat-btn');

const sidebarToggle  = $('#sidebar-toggle');
const sidebar        = $('#sidebar');
const sidebarOverlay = $('#sidebar-overlay');
const sidebarClose   = $('#sidebar-close');
const systemPrompt   = $('#system-prompt');
const tempSlider     = $('#temperature');
const tempValue      = $('#temp-value');
const tokensSlider   = $('#max-tokens');
const tokensValue    = $('#tokens-value');
const streamToggle   = $('#stream-toggle');
const clearSettings  = $('#clear-settings-btn');

const chatContainer  = $('#chat-container');
const messagesEl     = $('#messages');
const welcome        = $('#welcome');
const welcomeStatus  = $('#welcome-status');
const userInput      = $('#user-input');
const sendBtn        = $('#send-btn');
const stopBtn        = $('#stop-btn');

// === Init ===
function init() {
  loadSettings();
  setupListeners();
  autoGrow();
  connect();
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
async function connect() {
  setStatus('connecting');
  welcomeStatus.textContent = 'Connecting to LM Studio...';

  try {
    const resp = await fetch(API_BASE + '/v1/models', {
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const data = await resp.json();
    state.connected = true;

    // Populate models
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
    welcomeStatus.textContent = 'What can I help you with?';
    updateSendBtn();
  } catch (err) {
    setStatus('disconnected');
    state.connected = false;
    modelSelect.innerHTML = '<option value="">Offline</option>';
    modelSelect.disabled = true;
    welcomeStatus.innerHTML = 'Could not reach LM Studio at <code>127.0.0.1:1234</code><br><span class="hint">Make sure the server is running in the Developer tab</span>';
    // Retry in 5s
    setTimeout(connect, 5000);
  }
}

function setStatus(s) {
  statusDot.className = 'status ' + s;
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

  // Build API messages
  const apiMessages = [];
  const sys = systemPrompt.value.trim();
  if (sys) apiMessages.push({ role: 'system', content: sys });
  apiMessages.push(...state.messages);

  const useStream = streamToggle.checked;
  state.streaming = true;
  state.abortController = new AbortController();
  sendBtn.classList.add('hidden');
  stopBtn.classList.remove('hidden');

  // Create assistant message
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
    const resp = await fetch(API_BASE + '/v1/chat/completions', {
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
  if (welcome) {
    welcome.style.display = '';
    messagesEl.appendChild(welcome);
  }
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
  newChatBtn.addEventListener('click', newChat);

  sidebarToggle.addEventListener('click', openSidebar);
  sidebarClose.addEventListener('click', closeSidebar);
  sidebarOverlay.addEventListener('click', closeSidebar);

  tempSlider.addEventListener('input', () => { tempValue.textContent = tempSlider.value; saveSettings(); });
  tokensSlider.addEventListener('input', () => { tokensValue.textContent = tokensSlider.value; saveSettings(); });
  systemPrompt.addEventListener('change', saveSettings);
  streamToggle.addEventListener('change', saveSettings);

  clearSettings.addEventListener('click', () => {
    localStorage.removeItem('lmstudio-chat-settings');
    systemPrompt.value = '';
    tempSlider.value = 0.7; tempValue.textContent = '0.7';
    tokensSlider.value = 2048; tokensValue.textContent = '2048';
    streamToggle.checked = true;
    closeSidebar();
  });

  userInput.addEventListener('input', () => { autoGrow(); updateSendBtn(); });
  userInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled && !state.streaming) sendMessage();
    }
  });

  sendBtn.addEventListener('click', () => { if (!state.streaming) sendMessage(); });
  stopBtn.addEventListener('click', stopStreaming);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !state.connected && !state.streaming) connect();
  });
}

// === Service Worker ===
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// === Start ===
init();
