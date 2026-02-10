// === State ===
const state = {
  serverUrl: '',
  connected: false,
  messages: [],       // { role, content }
  streaming: false,
  abortController: null,
};

// === DOM Elements ===
const $ = (sel) => document.querySelector(sel);
const banner         = $('#connection-banner');
const serverUrlInput = $('#server-url');
const connectBtn     = $('#connect-btn');
const saveCheckbox   = $('#save-connection');

const header         = $('#header');
const statusDot      = $('#status-indicator');
const headerTitle    = $('#header-title');
const modelSelect    = $('#model-select');
const clearChatBtn   = $('#clear-chat-btn');

const sidebarToggle  = $('#sidebar-toggle');
const sidebar        = $('#sidebar');
const sidebarOverlay = $('#sidebar-overlay');
const sidebarClose   = $('#sidebar-close');
const sidebarUrl     = $('#sidebar-server-url');
const sidebarConnect = $('#sidebar-connect-btn');
const systemPrompt   = $('#system-prompt');
const tempSlider     = $('#temperature');
const tempValue      = $('#temp-value');
const tokensSlider   = $('#max-tokens');
const tokensValue    = $('#tokens-value');
const streamToggle   = $('#stream-toggle');
const clearSettings  = $('#clear-settings-btn');

const chatContainer  = $('#chat-container');
const messagesEl     = $('#messages');
const userInput      = $('#user-input');
const sendBtn        = $('#send-btn');
const stopBtn        = $('#stop-btn');

// === Init ===
function init() {
  loadSettings();
  setupListeners();
  autoGrowTextarea();

  if (state.serverUrl) {
    serverUrlInput.value = state.serverUrl;
    sidebarUrl.value = state.serverUrl;
    attemptConnect(state.serverUrl);
  } else {
    banner.classList.remove('hidden');
  }

  showWelcome();
}

// === Settings Persistence ===
function loadSettings() {
  const saved = localStorage.getItem('lmstudio-settings');
  if (saved) {
    try {
      const s = JSON.parse(saved);
      state.serverUrl = s.serverUrl || '';
      systemPrompt.value = s.systemPrompt || '';
      tempSlider.value = s.temperature ?? 0.7;
      tokensSlider.value = s.maxTokens ?? 2048;
      streamToggle.checked = s.stream ?? true;
      tempValue.textContent = tempSlider.value;
      tokensValue.textContent = tokensSlider.value;
    } catch(e) { /* ignore */ }
  }
}

function saveSettings() {
  localStorage.setItem('lmstudio-settings', JSON.stringify({
    serverUrl: saveCheckbox.checked ? state.serverUrl : '',
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
  // strip trailing slashes
  url = url.replace(/\/+$/, '');
  // add http:// if no protocol
  if (!/^https?:\/\//i.test(url)) {
    url = 'http://' + url;
  }
  return url;
}

async function attemptConnect(raw) {
  const base = normalizeUrl(raw);
  if (!base) return;

  setStatus('connecting');

  try {
    const resp = await fetch(base + '/v1/models', {
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const data = await resp.json();
    state.serverUrl = base;
    state.connected = true;

    // populate models
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
    banner.classList.add('hidden');
    sidebarUrl.value = raw.trim();
    saveSettings();
  } catch (err) {
    setStatus('disconnected');
    state.connected = false;
    modelSelect.innerHTML = '<option value="">Connection failed</option>';
    modelSelect.disabled = true;

    if (!banner.classList.contains('hidden')) {
      // Show error on the banner
      showBannerError('Could not connect. Check the address and make sure LM Studio\'s server is running.');
    }
  }
}

function setStatus(s) {
  statusDot.className = 'status ' + s;
  statusDot.title = s.charAt(0).toUpperCase() + s.slice(1);
}

function showBannerError(msg) {
  let errEl = banner.querySelector('.banner-error');
  if (!errEl) {
    errEl = document.createElement('p');
    errEl.className = 'banner-error';
    errEl.style.cssText = 'color:#f5a0a0;font-size:0.85rem;margin-top:12px;';
    banner.querySelector('.banner-content').appendChild(errEl);
  }
  errEl.textContent = msg;
}

// === Chat ===
function showWelcome() {
  if (messagesEl.querySelector('.welcome-msg')) return;
  const div = document.createElement('div');
  div.className = 'welcome-msg';
  div.innerHTML = '<h3>LM Studio Remote</h3><p>Send a message to start chatting with your local LLM.</p>';
  messagesEl.appendChild(div);
}

function removeWelcome() {
  const w = messagesEl.querySelector('.welcome-msg');
  if (w) w.remove();
}

function addMessage(role, content, isError) {
  removeWelcome();
  const wrap = document.createElement('div');
  wrap.className = `message ${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble' + (isError ? ' error' : '');

  if (role === 'assistant' && !isError) {
    bubble.innerHTML = renderMarkdown(content);
  } else {
    bubble.textContent = content;
  }

  wrap.appendChild(bubble);
  messagesEl.appendChild(wrap);
  addCopyButtons(bubble);
  scrollToBottom();
  return bubble;
}

function renderMarkdown(text) {
  if (typeof marked !== 'undefined') {
    return marked.parse(text, { breaks: true });
  }
  // fallback: basic escaping + newlines
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

function addCopyButtons(bubble) {
  bubble.querySelectorAll('pre').forEach(pre => {
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
    pre.style.position = 'relative';
    pre.appendChild(btn);
  });
}

function scrollToBottom() {
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

async function sendMessage() {
  const text = userInput.value.trim();
  if (!text || !state.connected) return;

  // Add user message
  state.messages.push({ role: 'user', content: text });
  addMessage('user', text);
  userInput.value = '';
  autoGrowTextarea();
  updateSendButton();

  // Build message array
  const apiMessages = [];
  const sysPrompt = systemPrompt.value.trim();
  if (sysPrompt) {
    apiMessages.push({ role: 'system', content: sysPrompt });
  }
  apiMessages.push(...state.messages);

  const useStream = streamToggle.checked;
  state.streaming = true;
  state.abortController = new AbortController();
  sendBtn.classList.add('hidden');
  stopBtn.classList.remove('hidden');

  // Prepare assistant bubble
  removeWelcome();
  const assistantWrap = document.createElement('div');
  assistantWrap.className = 'message assistant';
  const assistantBubble = document.createElement('div');
  assistantBubble.className = 'message-bubble';

  // typing indicator
  assistantBubble.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
  assistantWrap.appendChild(assistantBubble);
  messagesEl.appendChild(assistantWrap);
  scrollToBottom();

  let fullContent = '';

  try {
    const body = {
      model: modelSelect.value || undefined,
      messages: apiMessages,
      temperature: parseFloat(tempSlider.value),
      max_tokens: parseInt(tokensSlider.value),
      stream: useStream,
    };

    const resp = await fetch(state.serverUrl + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
              assistantBubble.innerHTML = renderMarkdown(fullContent);
              addCopyButtons(assistantBubble);
              scrollToBottom();
            }
          } catch(e) { /* skip malformed chunk */ }
        }
      }
    } else {
      const data = await resp.json();
      fullContent = data.choices?.[0]?.message?.content || '(empty response)';
      assistantBubble.innerHTML = renderMarkdown(fullContent);
      addCopyButtons(assistantBubble);
      scrollToBottom();
    }

    state.messages.push({ role: 'assistant', content: fullContent });

  } catch (err) {
    if (err.name === 'AbortError') {
      if (fullContent) {
        // keep partial content
        state.messages.push({ role: 'assistant', content: fullContent });
      } else {
        assistantBubble.innerHTML = '<em>Stopped.</em>';
      }
    } else {
      assistantBubble.className = 'message-bubble error';
      assistantBubble.textContent = 'Error: ' + err.message;

      // If connection lost, update status
      state.connected = false;
      setStatus('disconnected');
    }
  } finally {
    state.streaming = false;
    state.abortController = null;
    sendBtn.classList.remove('hidden');
    stopBtn.classList.add('hidden');
    updateSendButton();
    scrollToBottom();
  }
}

function stopStreaming() {
  if (state.abortController) {
    state.abortController.abort();
  }
}

function clearChat() {
  state.messages = [];
  messagesEl.innerHTML = '';
  showWelcome();
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

// === Textarea auto-grow ===
function autoGrowTextarea() {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
}

function updateSendButton() {
  sendBtn.disabled = !userInput.value.trim() || !state.connected;
}

// === Event Listeners ===
function setupListeners() {
  // Connection banner
  connectBtn.addEventListener('click', () => attemptConnect(serverUrlInput.value));
  serverUrlInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') attemptConnect(serverUrlInput.value);
  });

  // Header
  clearChatBtn.addEventListener('click', clearChat);

  // Sidebar
  sidebarToggle.addEventListener('click', openSidebar);
  sidebarClose.addEventListener('click', closeSidebar);
  sidebarOverlay.addEventListener('click', closeSidebar);

  sidebarConnect.addEventListener('click', () => {
    attemptConnect(sidebarUrl.value);
    closeSidebar();
  });

  // Settings changes
  tempSlider.addEventListener('input', () => {
    tempValue.textContent = tempSlider.value;
    saveSettings();
  });

  tokensSlider.addEventListener('input', () => {
    tokensValue.textContent = tokensSlider.value;
    saveSettings();
  });

  systemPrompt.addEventListener('change', saveSettings);
  streamToggle.addEventListener('change', saveSettings);

  clearSettings.addEventListener('click', () => {
    localStorage.removeItem('lmstudio-settings');
    state.serverUrl = '';
    state.connected = false;
    state.messages = [];
    systemPrompt.value = '';
    tempSlider.value = 0.7;
    tempValue.textContent = '0.7';
    tokensSlider.value = 2048;
    tokensValue.textContent = '2048';
    streamToggle.checked = true;
    setStatus('disconnected');
    modelSelect.innerHTML = '<option value="">No models</option>';
    modelSelect.disabled = true;
    messagesEl.innerHTML = '';
    showWelcome();
    closeSidebar();
    banner.classList.remove('hidden');
  });

  // Input
  userInput.addEventListener('input', () => {
    autoGrowTextarea();
    updateSendButton();
  });

  userInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled && !state.streaming) {
        sendMessage();
      }
    }
  });

  sendBtn.addEventListener('click', () => {
    if (!state.streaming) sendMessage();
  });

  stopBtn.addEventListener('click', stopStreaming);

  // Keep connection alive — re-check on visibility change
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.serverUrl && !state.streaming) {
      attemptConnect(state.serverUrl.replace(/^https?:\/\//, ''));
    }
  });
}

// === Service Worker ===
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// === Start ===
init();
