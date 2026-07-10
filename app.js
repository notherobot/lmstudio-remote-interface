// === Version ===
// Bump both together on every release (keep in sync with sw.js's CACHE_NAME
// and the ?v= query strings in index.html).
const APP_VERSION = 'v0.6.0';
const APP_VERSION_DATE = '2026-07-10';

// === State ===
const state = {
  apiBase: '',
  connected: false,
  messages: [],
  streaming: false,
  abortController: null,
  currentModel: null,
  currentBackend: 'lmstudio', // 'lmstudio' (direct) or 'anythingllm' (workspace)
  modelCaps: { vision: false },
  modelMeta: {},          // { [modelId]: { type: 'llm'|'vlm'|... } } from /api/v0/models
  lastLoadedModel: null,  // model that last actually produced output — drives the loading bar
  attachments: [],       // pending uploads: { kind:'image'|'file', name, size, url?, text? }
  sessions: [],          // saved chat sessions
  currentSessionId: null,
  stickToBottom: true,   // auto-scroll only while the user is at the bottom
  // Optional AnythingLLM backend (Tier 1 hybrid). LM Studio stays the required
  // backbone; when a URL + key are set, that instance's workspaces are added
  // to the model picker so a chat can be routed to RAG/agents instead of the
  // model directly. Talks to AnythingLLM's OpenAI-compatible endpoints, so the
  // same request/stream shape as LM Studio is reused.
  anythingllm: { url: '', key: '', workspaces: [] },
};

// === DOM ===
const $ = (sel) => document.querySelector(sel);
const appEl          = $('#app');
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
const anythingUrl    = $('#anythingllm-url');
const anythingKey    = $('#anythingllm-key');
const anythingSave   = $('#anythingllm-save');
const anythingStatus = $('#anythingllm-status');
const disconnectBtn  = $('#disconnect-btn');
const systemPrompt   = $('#system-prompt');
const tempSlider     = $('#temperature');
const tempValue      = $('#temp-value');
const tokensSlider   = $('#max-tokens');
const tokensValue    = $('#tokens-value');
const streamToggle   = $('#stream-toggle');
const collapseToggle = $('#collapse-toggle');

const messagesEl     = $('#messages');
const welcome        = $('#welcome');
const userInput      = $('#user-input');
const sendBtn        = $('#send-btn');
const stopBtn        = $('#stop-btn');

const attachFileBtn  = $('#attach-file-btn');
const fileInput      = $('#file-input');
const attachmentsEl  = $('#attachments');

const historyBtn     = $('#history-btn');
const historyPanel   = $('#history-panel');
const historyOverlay = $('#history-overlay');
const historyClose   = $('#history-close');
const historyNew     = $('#history-new');
const historyList    = $('#history-list');
const historyEmpty   = $('#history-empty');
const historySearch  = $('#history-search');
const scrollPill     = $('#scroll-pill');
const composerEl     = $('.composer');

// === Init ===
function init() {
  const versionFull = `${APP_VERSION} · ${formatVersionDate(APP_VERSION_DATE)}`;
  document.querySelectorAll('.app-version').forEach(el => {
    if (el.classList.contains('header-version')) {
      el.textContent = APP_VERSION;
      el.title = versionFull;
    } else {
      el.innerHTML = `${escapeHtml(APP_VERSION)} <span class="version-date">· ${escapeHtml(formatVersionDate(APP_VERSION_DATE))}</span>`;
    }
  });
  loadSettings();
  loadSessions();
  setupListeners();
  updateAnythingStatus();

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
    collapseToggle.checked = s.collapseThinking ?? true;
    tempValue.textContent = tempSlider.value;
    tokensValue.textContent = tokensSlider.value;
    state.anythingllm.url = s.anythingllmUrl || '';
    state.anythingllm.key = s.anythingllmKey || '';
    if (anythingUrl) anythingUrl.value = state.anythingllm.url;
    if (anythingKey) anythingKey.value = state.anythingllm.key;
  } catch(e) { /* ignore */ }
}

function saveSettings() {
  localStorage.setItem('lmstudio-chat-settings', JSON.stringify({
    systemPrompt: systemPrompt.value,
    temperature: parseFloat(tempSlider.value),
    maxTokens: parseInt(tokensSlider.value),
    stream: streamToggle.checked,
    collapseThinking: collapseToggle.checked,
    anythingllmUrl: state.anythingllm.url,
    anythingllmKey: state.anythingllm.key,
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

    const models = data.data || [];
    // Pull in AnythingLLM workspaces (best-effort) before building the picker
    // so both backends appear together. LM Studio being reachable is what
    // marks us "connected"; AnythingLLM is additive and never blocks.
    await refreshAnythingLLM();
    populateModelDropdown(models);
    await refreshModelMeta();
    refreshModelCaps();
    updateAnythingStatus();

    setStatus('connected');
    updateSendBtn();
  } catch (err) {
    setStatus('disconnected');
    state.connected = false;
    modelSelect.innerHTML = '<option value="">Offline</option>';
    modelSelect.disabled = true;
    state.modelCaps.vision = false;
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
  chatContainer.classList.toggle('chat-empty', !!welcome && welcome.style.display !== 'none');
  autoGrow(); // size the textarea now that it's visible (avoids a collapsed/cropped field)
  userInput.focus();
}

function showSetup() {
  state.connected = false;
  state.messages = [];
  state.apiBase = '';
  state.currentSessionId = null;
  state.currentBackend = 'lmstudio';
  state.modelCaps.vision = false;
  clearAttachments();
  closeHistory();
  localStorage.removeItem('lmstudio-server-url');
  setStatus('disconnected');
  modelSelect.innerHTML = '<option value="">Offline</option>';
  modelSelect.disabled = true;
  messagesEl.innerHTML = '';
  if (welcome) messagesEl.appendChild(welcome);
  showWelcome(true);

  setup.classList.remove('hidden');
  headerEl.classList.add('hidden');
  chatContainer.classList.add('hidden');
  inputArea.classList.add('hidden');
  setupUrl.value = '';
  setupError.classList.add('hidden');
  setupUrl.focus();
}

// === Chat ===
// Nothing to scroll on the welcome screen, so lock #chat-container's
// overflow while it's showing — otherwise a stray touch there triggers an
// elastic rubber-band bounce with no content backing it.
function showWelcome(visible) {
  if (welcome) welcome.style.display = visible ? '' : 'none';
  chatContainer.classList.toggle('chat-empty', visible);
}

function hideWelcome() {
  showWelcome(false);
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
  if (role === 'assistant' && !isError) {
    addMessageActions(body, () => (typeof content === 'string' ? content : extractText(content)));
  }
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

function addModelDivider(text) {
  hideWelcome();
  const divider = document.createElement('div');
  divider.className = 'model-divider';
  const label = document.createElement('span');
  label.textContent = text;
  divider.appendChild(label);
  messagesEl.appendChild(divider);
  scrollToBottom();
}

function onModelChange() {
  const selected = modelSelect.value;
  const backend = activeBackendKey();
  if (!selected || (selected === state.currentModel && backend === state.currentBackend)) return;
  state.currentModel = selected;
  state.currentBackend = backend;
  const label = backend === 'anythingllm'
    ? `${modelSelect.selectedOptions[0]?.textContent} · workspace`
    : `${prettyModelName(selected)} loaded`;
  addModelDivider(label);
  refreshModelCaps();
  saveCurrentSession();
}

// Best-effort "pretty" display name for a model dropdown entry, e.g.
// "mistralai/mistral-small-3.2" -> "Mistral Small 3.2 24B". Parsed from the
// slug alone — there's no API that returns a canonical display name, so this
// is a heuristic and won't be right for every model. The raw id is always
// what's actually sent to LM Studio; this only changes what's displayed.

// Parameter-count overrides for well-known families whose slug doesn't
// include a size token at all (e.g. "mistral-small-3.2" has no "24b" in it).
// Checked in order — more specific patterns first.
const MODEL_SIZE_OVERRIDES = [
  [/mistral-small-3(\.\d+)?\b/i, '24B'],
  [/mistral-small(?!-3)\b/i, '22B'],
  [/^codestral(?!.*\d+b)/i, '22B'],
  [/command-r-plus/i, '104B'],
  [/command-r(?!-plus)/i, '35B'],
  [/deepseek-v3(?!.*\d+b)/i, '671B'],
  [/deepseek-r1(?!-distill)(?!.*\d+b)/i, '671B'],
];

// Individual slug tokens that should render as a specific display form
// instead of naive Title Case.
const MODEL_WORD_OVERRIDES = {
  deepseek: 'DeepSeek', glm: 'GLM', gpt: 'GPT', qwq: 'QwQ', minicpm: 'MiniCPM',
  internlm: 'InternLM', smollm: 'SmolLM', wizardlm: 'WizardLM', llm: 'LLM',
  it: 'Instruct', vl: 'VL', moe: 'MoE',
};

// Slug tokens that carry no useful display information (quantization/format tags).
const MODEL_NOISE_RE = /^(gguf|mlx|ggml|awq|gptq|exl2?|hf|safetensors|fp16|fp32|bf16|int4|int8|w4a16|w8a16|q\d(_[a-z0-9]+)*)$/i;

function prettyModelName(id) {
  if (!id) return id;
  const slug = id.includes('/') ? id.slice(id.indexOf('/') + 1) : id;
  const tokens = slug.split(/[-_]/).filter(Boolean);

  // Keep the size token in its natural position (e.g. "32B" before "Instruct")
  // when the slug has one; only append at the end for override-derived sizes,
  // which have no natural position since the slug never mentions a size at all.
  const words = [];
  let foundSizeInSlug = false;
  for (const t of tokens) {
    if (MODEL_NOISE_RE.test(t) || /^\d{4,}$/.test(t)) continue;
    if (/^(\d+x)?\d+(\.\d+)?b$/i.test(t)) {
      foundSizeInSlug = true;
      words.push(t.replace(/b$/i, 'B')); // uppercase only the trailing B, e.g. keep "8x7B" not "8X7B"
      continue;
    }
    const lower = t.toLowerCase();
    words.push(MODEL_WORD_OVERRIDES[lower] || (t.charAt(0).toUpperCase() + t.slice(1)));
  }

  if (!foundSizeInSlug) {
    const override = MODEL_SIZE_OVERRIDES.find(([re]) => re.test(slug));
    if (override) words.push(override[1]);
  }

  const pretty = words.join(' ').replace(/\s+/g, ' ').trim();
  return pretty || id;
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

// === Backends (LM Studio direct + optional AnythingLLM workspaces) ===
// The active backend is encoded on the selected <option>'s data-backend
// attribute; the option's value is the raw model id / workspace slug that gets
// sent as `model`.
function activeBackendKey() {
  return modelSelect.selectedOptions[0]?.dataset.backend || 'lmstudio';
}

function activeModelId() {
  return modelSelect.value || '';
}

// URL + headers for a chat/completions call against a given backend. Both
// LM Studio and AnythingLLM expose an OpenAI-compatible surface, so callers
// only differ by base URL, endpoint path, and auth header.
function backendRequest(key) {
  if (key === 'anythingllm') {
    return {
      chatUrl: state.anythingllm.url + '/api/v1/openai/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + state.anythingllm.key,
      },
    };
  }
  return {
    chatUrl: state.apiBase + '/v1/chat/completions',
    headers: { 'Content-Type': 'application/json' },
  };
}

// First LM Studio model id in the dropdown — used for side-effect-free calls
// (like auto-naming) that should always run direct, never through a workspace.
function firstLmModelId() {
  for (const opt of modelSelect.options) {
    if (opt.dataset.backend === 'lmstudio' && opt.value) return opt.value;
  }
  return '';
}

function titleCaseSlug(slug) {
  return String(slug).split(/[-_]/).filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Best-effort fetch of AnythingLLM workspaces via its OpenAI-compatible
// /models endpoint (each "model" is a workspace slug). Never throws — a
// failure just leaves the workspace list empty so LM Studio keeps working.
async function refreshAnythingLLM() {
  const { url, key } = state.anythingllm;
  if (!url || !key) { state.anythingllm.workspaces = []; return; }
  try {
    const resp = await fetch(url + '/api/v1/openai/models', {
      headers: { 'Authorization': 'Bearer ' + key },
      signal: AbortSignal.timeout(6000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    state.anythingllm.workspaces = (data.data || []).map(w => ({
      id: w.id,
      name: w.name || titleCaseSlug(w.id),
    }));
  } catch (e) {
    state.anythingllm.workspaces = [];
  }
}

// (Re)build the model dropdown from LM Studio models plus any AnythingLLM
// workspaces, preserving the current selection where possible. When no
// workspaces are configured the LM Studio models are added bare (no optgroup),
// keeping the direct-only experience visually identical to before.
function populateModelDropdown(lmModels) {
  const prevValue = modelSelect.value;
  const prevBackend = activeBackendKey();
  const workspaces = state.anythingllm.workspaces || [];
  const useGroups = workspaces.length > 0;

  modelSelect.innerHTML = '';
  modelSelect.disabled = false;

  const addOption = (parent, value, label, backend) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    opt.dataset.backend = backend;
    opt.title = value;
    parent.appendChild(opt);
  };

  if (lmModels.length === 0 && !useGroups) {
    modelSelect.innerHTML = '<option value="">No models loaded</option>';
    return;
  }

  const lmParent = useGroups ? document.createElement('optgroup') : modelSelect;
  if (useGroups) lmParent.label = 'LM Studio';
  lmModels.forEach(m => addOption(lmParent, m.id, prettyModelName(m.id), 'lmstudio'));
  if (useGroups && lmModels.length) modelSelect.appendChild(lmParent);

  if (useGroups) {
    const wsParent = document.createElement('optgroup');
    wsParent.label = 'AnythingLLM';
    workspaces.forEach(w => addOption(wsParent, w.id, w.name, 'anythingllm'));
    modelSelect.appendChild(wsParent);
  }

  // Restore the prior selection (matching both value and backend) so a
  // reconnect / workspace refresh doesn't silently switch the active model.
  const match = [...modelSelect.options].find(
    o => o.value === prevValue && o.dataset.backend === prevBackend);
  if (match) {
    modelSelect.value = prevValue;
  }
  state.currentModel = modelSelect.value || null;
  state.currentBackend = activeBackendKey();
}

// Fetch type info ("llm" / "vlm" / ...) for every downloaded model in one shot,
// via LM Studio's native API. Powers both capability detection and routing.
async function refreshModelMeta() {
  try {
    const resp = await fetch(state.apiBase + '/api/v0/models', { signal: AbortSignal.timeout(4000) });
    if (resp.ok) {
      const data = await resp.json();
      const meta = {};
      (data.data || []).forEach(m => { meta[m.id] = { type: (m.type || '').toLowerCase() }; });
      state.modelMeta = meta;
    }
  } catch (e) { /* endpoint unavailable — routing/caps fall back to name heuristics */ }
}

function modelType(id) {
  return state.modelMeta[id]?.type || (nameSuggestsVision(id) ? 'vlm' : '');
}

// Detect capabilities of the active model. Vision only applies to LM Studio
// models (AnythingLLM workspaces are treated as text-only through the shim).
function refreshModelCaps() {
  const vision = activeBackendKey() === 'lmstudio' && modelType(activeModelId()) === 'vlm';

  state.modelCaps.vision = vision;

  // Drop any pending image attachments if the new model can't see them
  if (!vision && state.attachments.some(a => a.kind === 'image')) {
    state.attachments = state.attachments.filter(a => a.kind !== 'image');
    renderAttachments();
    updateSendBtn();
  }
}

// Save the AnythingLLM URL + key, then reconnect so its workspaces refresh
// into the model picker alongside the LM Studio models.
function applyAnythingLLM() {
  state.anythingllm.url = normalizeUrl(anythingUrl.value);
  state.anythingllm.key = anythingKey.value.trim();
  anythingUrl.value = state.anythingllm.url;
  saveSettings();
  const orig = anythingSave.textContent;
  anythingSave.textContent = 'Refreshing…';
  anythingSave.disabled = true;
  Promise.resolve(connect()).finally(() => {
    anythingSave.textContent = orig;
    anythingSave.disabled = false;
    updateAnythingStatus();
  });
}

// Small status line under the AnythingLLM fields in Settings.
function updateAnythingStatus() {
  if (!anythingStatus) return;
  const { url, key, workspaces } = state.anythingllm;
  if (!url || !key) {
    anythingStatus.textContent = 'Not configured — add a URL and API key to use workspaces.';
  } else if (workspaces.length) {
    anythingStatus.textContent = `Connected — ${workspaces.length} workspace${workspaces.length === 1 ? '' : 's'} available in the model picker.`;
  } else {
    anythingStatus.textContent = 'Set, but no workspaces loaded. Check the URL, API key, and that CORS allows this site.';
  }
}

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatVersionDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function modelLoadingHTML(modelId) {
  return `<div class="model-loading">
    <div class="model-loading-label">Loading <strong>${escapeHtml(prettyModelName(modelId))}</strong>…</div>
    <div class="model-loading-bar"><div class="model-loading-fill"></div></div>
  </div>`;
}

function renderMarkdown(text) {
  if (typeof marked !== 'undefined') {
    return marked.parse(text, { breaks: true });
  }
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

// Wrap reasoning ("thinking") in a collapsed <details> dropdown, leaving the
// answer rendered normally. Handles <think>/<thinking> tags (including a
// still-open block mid-stream) and un-tagged "thinking out loud" output.
// Channel-token reasoning: some chat templates (gpt-oss/Harmony-style) leak
// special tokens like "<|channel|>thought … <|channel|>final …" into the text.
// Pipes are sometimes half-eaten by rendering, so match loosely (<|channel> too).
const CHANNEL_THINK_RE = /<\|?channel\|?>\s*(?:thought|thinking|analysis)[^\S\n]*(?:<\|?message\|?>)?/i;
const CHANNEL_FINAL_RE = /(?:<\|?start\|?>\s*(?:assistant)?\s*)?<\|?channel\|?>\s*(?:final|response|answer)[^\S\n]*(?:<\|?message\|?>)?/i;
const SPECIAL_TOKEN_RE = /<\|?(?:channel|message|start|end|return|im_start|im_end|endoftext|eot_id|assistant|system|developer)\|?>/gi;
const stripSpecialTokens = (s) => s.replace(SPECIAL_TOKEN_RE, '');

function renderMessage(text, streaming) {
  if (collapseToggle && !collapseToggle.checked) return renderMarkdown(text);

  // Channel-token reasoning (checked first — these also often contain lists
  // that would confuse the freeform detector)
  const chThink = text.match(CHANNEL_THINK_RE);
  if (chThink) {
    const pre = text.slice(0, chThink.index);
    const afterThink = text.slice(chThink.index + chThink[0].length);
    const chFinal = afterThink.match(CHANNEL_FINAL_RE);
    let html = pre.trim() ? renderMarkdown(stripSpecialTokens(pre)) : '';
    if (chFinal) {
      const reasoning = stripSpecialTokens(afterThink.slice(0, chFinal.index));
      const answer = stripSpecialTokens(afterThink.slice(chFinal.index + chFinal[0].length));
      html += thinkBlock(reasoning, false);
      if (answer.trim()) html += renderMarkdown(answer.trim());
    } else {
      // No final channel marker (yet). While streaming that's normal; once
      // complete, try to find the answer inside. If none can be found, render
      // the block EXPANDED — the answer may be trapped in there, and an open
      // box beats a hidden answer.
      const inner = stripSpecialTokens(afterThink);
      const split = !streaming ? findAnswerBoundary(inner) : null;
      if (split && split.answer.trim()) {
        html += thinkBlock(split.reasoning, false);
        html += renderMarkdown(split.answer.trim());
      } else {
        html += thinkBlock(inner, !!streaming, !streaming);
      }
    }
    return html || renderMarkdown(stripSpecialTokens(text));
  }

  // Tag-delimited reasoning (<think>…</think>)
  if (/<think(?:ing)?>/i.test(text)) {
    const THINK_RE = /<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi;
    const parts = []; // { type: 'md'|'think', text, open? }
    let lastIndex = 0;
    let m;
    while ((m = THINK_RE.exec(text)) !== null) {
      const before = text.slice(lastIndex, m.index);
      if (before.trim()) parts.push({ type: 'md', text: before });
      parts.push({ type: 'think', text: m[1] });
      lastIndex = THINK_RE.lastIndex;
    }
    const rest = text.slice(lastIndex);
    const openIdx = rest.search(/<think(?:ing)?>/i);
    if (openIdx !== -1) {
      const before = rest.slice(0, openIdx);
      if (before.trim()) parts.push({ type: 'md', text: before });
      parts.push({ type: 'think', text: rest.slice(openIdx).replace(/^<think(?:ing)?>/i, ''), open: true });
    } else if (rest.trim()) {
      parts.push({ type: 'md', text: rest });
    }

    // If the completed message is nothing but think content — either the tag
    // never closed, or the reasoning parser swallowed the answer too (the
    // telltale: answer glued on with no space after the last thought) — find
    // the boundary inside the last block so the answer isn't trapped. When no
    // boundary exists, render the block EXPANDED: the answer may be in there,
    // and an open box beats a hidden answer.
    if (!streaming) {
      const last = parts[parts.length - 1];
      const hasAnswerOutside = parts.some(p => p.type === 'md');
      if (last && last.type === 'think' && !hasAnswerOutside) {
        const split = findAnswerBoundary(last.text);
        if (split && split.answer.trim()) {
          last.text = split.reasoning;
          parts.push({ type: 'md', text: split.answer });
        } else {
          last.forceOpen = true;
        }
      }
    }

    let html = '';
    for (const p of parts) {
      if (p.type === 'md') html += renderMarkdown(p.text.trim());
      else html += thinkBlock(p.text, !!p.open && !!streaming, !!p.forceOpen);
    }
    return html || renderMarkdown(text);
  }

  // Un-tagged reasoning: models that "think out loud" in plain text
  const ff = detectFreeformReasoning(text, streaming);
  if (ff) {
    let html = ff.reasoning.trim() ? thinkBlock(ff.reasoning, !!ff.streaming) : '';
    if (ff.answer.trim()) html += renderMarkdown(ff.answer.trim());
    return html || renderMarkdown(text);
  }

  return renderMarkdown(text);
}

// Some models emit their chain-of-thought as plain prose (no tags), opening with
// a recognizable preamble and then producing the real answer. We only split at
// high-confidence boundaries — guessing from prose structure proved unreliable
// (it leaked reasoning and broke code fences), so when unsure we show raw.
const REASON_PREAMBLE = /^(?:\s*(?:>|#{1,4})?\s*)?(?:okay[,]?\s+)?(here'?s\s+(?:a|my)\s+(?:thinking|thought|reasoning)(?:\s+process)?|(?:my\s+)?(?:thinking|thought)\s+process\b|reasoning\s*:|let'?s\s+think\b|let\s+me\s+think\b)/i;
// A) Explicit final-answer heading/label — the answer is on the NEXT line(s).
const ANSWER_HEADING = /^\s{0,3}(?:[-*]|\d+[.)])?\s*(?:#{1,4}\s*)?(?:\*\*)?\s*(?:final\s+response|final\s+answer|draft\s+response|my\s+(?:response|answer)|(?:response|answer|output|reply|solution)\s*:)\b[\s:.\-–—)*]*(.*)$/i;
// B) Answer-opener phrase — the answer STARTS on this line (kept in the answer).
const ANSWER_OPENER = /^\s{0,3}>?\s*(?:here'?s|here\s+is|below\s+is|this\s+is)\s+(?:the|my|a|an|your)\s+(?:updated|revised|final|fixed|corrected|complete|completed|new|working|refined|improved|full|cleaned[-\s]?up|reworked|modified)\b/i;
// Markdown list/heading/quote/table starters. List markers require a trailing
// space so bold text (**x**) and decimals (3.14) aren't mistaken for lists.
const LISTY = /^(?:[-*]\s|>|\d+[.)]\s|#{1,6}\s|\|)/;

// Close a dangling ``` fence so a split doesn't leak broken markdown.
function balanceFences(s) {
  const fences = (s.match(/```/g) || []).length;
  return fences % 2 ? s + '\n```' : s;
}

// Find where reasoning ends and the answer begins inside a completed blob of
// text. Used both for un-tagged "thinking out loud" output and for <think>
// blocks that were never closed. Returns {reasoning, answer} or null.
function findAnswerBoundary(text) {
  const lines = text.split('\n');
  let headingIdx = -1, inlineAnswer = '', openerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const mm = lines[i].match(ANSWER_HEADING);
    if (mm) {
      headingIdx = i;
      const trail = (mm[1] || '').trim();
      inlineAnswer = (!trail || /^[([]/.test(trail) || trail.endsWith(':')) ? '' : trail;
    }
    if (ANSWER_OPENER.test(lines[i])) openerIdx = i;
  }

  // Prefer whichever boundary appears later in the message.
  if (openerIdx >= 0 && openerIdx >= headingIdx) {
    const reasoning = lines.slice(0, openerIdx).join('\n');
    const answer = lines.slice(openerIdx).join('\n'); // opener line is part of the answer
    if (answer.trim()) return { reasoning, answer };
  }
  if (headingIdx >= 0) {
    const reasoning = lines.slice(0, headingIdx).join('\n');
    const after = lines.slice(headingIdx + 1).join('\n');
    const answer = (inlineAnswer ? inlineAnswer + '\n' : '') + after;
    if (answer.trim()) return { reasoning, answer };
  }

  // C) Glued seam: a sentence end jammed directly against the start of a new
  // sentence with no space ("…irrational number.The square root…",
  // "…(January 2025).The CEO…"). That's the telltale of a template/parser
  // concatenating reasoning and answer as separate generations. The sentence
  // may end after letters, digits, closing brackets/quotes, or a percent
  // sign, and the answer may start with a capitalized word, "I", or bold
  // text. Split at the last such seam outside code fences.
  const GLUE_RE = /(?:[a-z]{2}|\d|[)\]"”'’%])[.!?](?=[A-Z][a-z]|I\b)|(?:[a-z]{2}|\d|[)\]"”'’%])[.!?:](?=\*\*[A-Za-z0-9])/g;
  let glueEnd = -1;
  let g;
  while ((g = GLUE_RE.exec(text)) !== null) {
    const fences = (text.slice(0, g.index).match(/```/g) || []).length;
    if (fences % 2 === 0) glueEnd = g.index + g[0].length; // ignore seams inside code
  }
  if (glueEnd > 0) {
    const answer = text.slice(glueEnd);
    if (answer.trim().length >= 8) return { reasoning: text.slice(0, glueEnd), answer };
  }

  // Narrow, safe structural rule: a single plain-prose block that directly
  // follows a block of reasoning steps (a list) is the answer. This only fires
  // for the clean "steps → answer" shape, never when prose meta precedes it.
  const blocks = text.split(/\n\s*\n/);
  let end = blocks.length - 1;
  while (end >= 0 && !blocks[end].trim()) end--;
  if (end >= 1) {
    const last = blocks[end].trim();
    const lastFirst = (last.split('\n')[0] || '').trim();
    const prevFirst = (blocks[end - 1].trim().split('\n')[0] || '').trim();
    const lastIsProse = !LISTY.test(lastFirst) && !lastFirst.startsWith('```');
    if (lastIsProse && LISTY.test(prevFirst) && last.length >= 2) {
      return { reasoning: blocks.slice(0, end).join('\n\n'), answer: last };
    }
  }

  return null;
}

function detectFreeformReasoning(text, streaming) {
  if (!REASON_PREAMBLE.test(text)) return null;

  const found = findAnswerBoundary(text);
  if (found) return found;

  // Still streaming: keep it collapsed as "Thinking…" until the boundary arrives.
  if (streaming) return { reasoning: text, answer: '', streaming: true };

  // No confident boundary — don't collapse (never hide or mangle the answer).
  return null;
}

function thinkBlock(inner, streaming, open) {
  const trimmed = balanceFences(inner.trim());
  const body = trimmed ? renderMarkdown(trimmed) : '<em>Thinking…</em>';
  const label = streaming ? 'Thinking…' : 'Thought process';
  return `<details class="think-block"${open ? ' open' : ''}><summary>${label}</summary><div class="think-content">${body}</div></details>`;
}

// === Syntax highlighting (dependency-free) ===
const HL_KEYWORDS = {
  js: 'const let var function return if else for while do switch case break continue new class extends super this typeof instanceof in of try catch finally throw async await yield import export from default null undefined true false void delete static get set',
  py: 'def return if elif else for while in not and or is None True False class import from as with try except finally raise lambda pass break continue global nonlocal yield async await assert del print self',
  css: '',
  html: '',
  json: 'true false null',
  sh: 'if then else elif fi for while do done case esac function echo exit return local export set read cd source',
  sql: 'select from where insert into values update set delete create table drop alter join left right inner outer on as order by group having limit offset and or not null primary key',
};
const HL_ALIASES = { javascript: 'js', typescript: 'js', jsx: 'js', tsx: 'js', ts: 'js', node: 'js', python: 'py', bash: 'sh', shell: 'sh', zsh: 'sh', xml: 'html', htm: 'html' };

function microHighlight(code, lang) {
  lang = HL_ALIASES[lang] || lang;
  const kw = new Set((HL_KEYWORDS[lang] || HL_KEYWORDS.js).split(' '));
  let out = '';
  // comments | strings | numbers | words — tokenize the raw code, escape as we emit
  const re = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|<!--[\s\S]*?-->)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|([\s\S])/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    if (m[1] !== undefined) {
      // '#' comments only apply to shell/python-ish; leave as plain elsewhere
      const isHash = m[1][0] === '#';
      const hashOk = lang === 'py' || lang === 'sh' || lang === 'yaml';
      out += (isHash && !hashOk) ? escapeHtml(m[1]) : `<span class="hl-com">${escapeHtml(m[1])}</span>`;
    } else if (m[2] !== undefined) out += `<span class="hl-str">${escapeHtml(m[2])}</span>`;
    else if (m[3] !== undefined) out += `<span class="hl-num">${escapeHtml(m[3])}</span>`;
    else if (m[4] !== undefined) out += kw.has(m[4]) ? `<span class="hl-kw">${escapeHtml(m[4])}</span>` : escapeHtml(m[4]);
    else out += escapeHtml(m[5]);
  }
  // html: tint tags after the fact (tokens above already escaped)
  if (lang === 'html') {
    out = out.replace(/(&lt;\/?)([a-zA-Z][\w-]*)/g, '$1<span class="hl-kw">$2</span>');
  }
  return out;
}

function codeLang(codeEl) {
  const cls = codeEl.className || '';
  const m = cls.match(/language-([\w-]+)/);
  if (m) return m[1].toLowerCase();
  const t = codeEl.textContent.trimStart();
  if (/^<!doctype|^<html|^</i.test(t)) return 'html';
  return '';
}

const looksLikeHtmlDoc = (t) => /^\s*(<!doctype html|<html)/i.test(t) || (/<\w+[^>]*>/.test(t) && /<\/(div|body|button|p|span|h\d|style|script)>/i.test(t));

function addCopyButtons(el) {
  el.querySelectorAll('pre').forEach(pre => {
    const code = pre.querySelector('code');

    // Syntax highlighting (re-applied per streaming render; cheap at this scale)
    if (code && !code.dataset.hl) {
      const lang = codeLang(code);
      code.innerHTML = microHighlight(code.textContent, lang || 'js');
      code.dataset.hl = '1';
    }

    // HTML preview button (artifacts-lite)
    if (code && !pre.querySelector('.preview-btn')) {
      const lang = codeLang(code);
      if (lang === 'html' || looksLikeHtmlDoc(code.textContent)) {
        const pv = document.createElement('button');
        pv.className = 'preview-btn';
        pv.textContent = 'Preview';
        pv.addEventListener('click', () => openPreview(code.textContent));
        pre.appendChild(pv);
      }
    }

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

// Tokens + speed line under a response. Uses server-reported usage when
// available; otherwise estimates from streamed delta count (marked with ~).
function appendStats(body, { tStart, firstTokenAt, deltaCount, usage }) {
  const tokens = usage?.completion_tokens ?? deltaCount;
  if (!tokens || tokens <= 0) return;
  const exact = usage?.completion_tokens != null;
  const elapsed = (performance.now() - (firstTokenAt || tStart)) / 1000;
  const speed = tokens / Math.max(elapsed, 0.001);
  const el = document.createElement('div');
  el.className = 'msg-stats';
  el.textContent = `${exact ? '' : '~'}${tokens} tokens · ${speed.toFixed(1)} tok/s`;
  body.appendChild(el);
}

function scrollToBottom(force) {
  if (force) state.stickToBottom = true;
  if (state.stickToBottom) chatContainer.scrollTop = chatContainer.scrollHeight;
}

function onChatScroll() {
  const gap = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight;
  state.stickToBottom = gap < 80;
  scrollPill.classList.toggle('hidden', state.stickToBottom);
}

async function sendMessage() {
  const text = userInput.value.trim();
  const attachments = state.attachments;
  if ((!text && attachments.length === 0) || !state.connected || state.streaming) return;

  // Large combined attachments make prompt processing take minutes on local
  // models — warn before sending so a "hang" isn't a surprise.
  const inlinedBytes = attachments.filter(a => a.kind === 'file').reduce((n, a) => n + (a.text?.length || 0), 0);
  if (inlinedBytes > 60000) {
    const kb = Math.round(inlinedBytes / 1024);
    if (!confirm(`You're sending ~${kb} KB of file text. Local models can take a long time to process large prompts — continue?`)) return;
  }

  const content = buildApiContent(text, attachments);
  state.messages.push({ role: 'user', content });
  addUserMessage(text, attachments);
  userInput.value = '';
  clearAttachments();
  autoGrow();
  updateSendBtn();
  saveCurrentSession();

  await generateReply();
}

// Removes the last assistant reply and asks the model again with the same
// conversation. Wired to the Regenerate button on the newest AI message.
function regenerate() {
  if (state.streaming || !state.connected) return;
  if (state.messages[state.messages.length - 1]?.role === 'assistant') {
    state.messages.pop();
  }
  const wraps = messagesEl.querySelectorAll('.message.assistant');
  if (wraps.length) wraps[wraps.length - 1].remove();
  saveCurrentSession();
  generateReply();
}

// Generate an assistant reply for the current state.messages.
async function generateReply() {
  // Model selection is purely whatever's in the dropdown — no auto-switching.
  const targetModel = activeModelId();
  const backendKey = activeBackendKey();
  const backend = backendRequest(backendKey);
  // The loading bar only makes sense for LM Studio (it may load a model fresh);
  // AnythingLLM workspaces are always ready, so skip it there.
  const isModelSwitch = backendKey === 'lmstudio' && !!targetModel && targetModel !== state.lastLoadedModel;

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
  // A model switch shows a distinct loading bar (load + queue time is
  // unpredictable); otherwise the usual typing dots for generation.
  bubble.innerHTML = isModelSwitch
    ? modelLoadingHTML(targetModel)
    : '<div class="typing"><span></span><span></span><span></span></div>';
  body.appendChild(bubble);
  wrap.appendChild(avatar);
  wrap.appendChild(body);
  messagesEl.appendChild(wrap);
  scrollToBottom(true);

  let fullContent = '';
  let reasoning = '';

  // Response stats: delta count approximates tokens when the server doesn't report usage
  const tStart = performance.now();
  let firstTokenAt = 0;
  let deltaCount = 0;
  let usage = null;
  let finishReason = null;

  // If nothing arrives for a while, say so — big prompts (multiple attached
  // files) can take minutes of prompt processing and look like a hang.
  const slowNote = document.createElement('div');
  slowNote.className = 'slow-note';
  slowNote.textContent = 'Still working — large prompts can take a while to process…';
  const slowTimer = setTimeout(() => { if (!firstTokenAt) body.appendChild(slowNote); }, 10000);
  const clearSlow = () => { clearTimeout(slowTimer); slowNote.remove(); };

  // Combine separate reasoning (LM Studio's reasoning_content) with the answer
  // so renderMessage can wrap it as a collapsible block. Inline <think> tags
  // already live inside fullContent and are handled there.
  const withReasoning = () =>
    reasoning ? `<think>${reasoning}</think>${fullContent}` : fullContent;

  try {
    const resp = await fetch(backend.chatUrl, {
      method: 'POST',
      headers: backend.headers,
      body: JSON.stringify({
        model: targetModel || undefined,
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
            if (chunk.usage) usage = chunk.usage;
            if (chunk.choices?.[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;
            const delta = chunk.choices?.[0]?.delta || {};
            let changed = false;
            if (delta.reasoning_content) { reasoning += delta.reasoning_content; changed = true; }
            if (delta.content) { fullContent += delta.content; changed = true; }
            if (changed) {
              if (!firstTokenAt) { firstTokenAt = performance.now(); state.lastLoadedModel = targetModel; clearSlow(); }
              deltaCount++;
              bubble.innerHTML = renderMessage(withReasoning(), true);
              addCopyButtons(bubble);
              scrollToBottom();
            }
          } catch(e) { /* skip */ }
        }
      }

      // Final render (streaming=false) so un-tagged reasoning gets split from
      // the answer now that the whole message has arrived.
      bubble.innerHTML = renderMessage(withReasoning(), false);
      addCopyButtons(bubble);
      scrollToBottom();
    } else {
      const data = await resp.json();
      usage = data.usage || null;
      finishReason = data.choices?.[0]?.finish_reason || null;
      const msg = data.choices?.[0]?.message || {};
      reasoning = msg.reasoning_content || '';
      // Only substitute the placeholder when there's truly nothing — if
      // reasoning exists, keep content empty so the boundary finder can
      // extract an answer that the parser swallowed into reasoning.
      fullContent = msg.content || (reasoning ? '' : '(empty response)');
      state.lastLoadedModel = targetModel;
      bubble.innerHTML = renderMessage(withReasoning());
      addCopyButtons(bubble);
      scrollToBottom();
    }

    if (finishReason === 'length') {
      const note = document.createElement('div');
      note.className = 'trunc-note';
      note.textContent = `⚠ Response was cut off — it hit the Max Tokens limit (${tokensSlider.value}). Raise Max Tokens in Settings and regenerate.`;
      body.appendChild(note);
    }
    const getRaw = () => JSON.stringify({
      model: targetModel, finish_reason: finishReason,
      reasoning_content: reasoning || undefined, content: fullContent,
    }, null, 2);
    appendStats(body, { tStart, firstTokenAt, deltaCount, usage });
    addMessageActions(body, () => fullContent, getRaw);
    state.messages.push({ role: 'assistant', content: fullContent });
    saveCurrentSession();
    maybeAutoName();

  } catch (err) {
    if (err.name === 'AbortError') {
      if (fullContent) {
        appendStats(body, { tStart, firstTokenAt, deltaCount, usage });
        addMessageActions(body, () => fullContent, () => JSON.stringify({ model: targetModel, aborted: true, reasoning_content: reasoning || undefined, content: fullContent }, null, 2));
        state.messages.push({ role: 'assistant', content: fullContent });
        saveCurrentSession();
      } else {
        bubble.innerHTML = '<em>Stopped.</em>';
      }
    } else if (backendKey === 'anythingllm') {
      // An AnythingLLM failure is isolated — don't tear down the LM Studio
      // connection or trigger its reconnect loop. Just surface the error.
      bubble.className = 'message-content error';
      bubble.textContent = `AnythingLLM request failed: ${err.message}. Check its URL, API key, and that CORS allows this site.`;
    } else {
      bubble.className = 'message-content error';
      bubble.textContent = err.message;
      state.connected = false;
      setStatus('disconnected');
      setTimeout(connect, 3000);
    }
  } finally {
    clearSlow();
    state.streaming = false;
    state.abortController = null;
    sendBtn.classList.remove('hidden');
    stopBtn.classList.add('hidden');
    updateSendBtn();
    scrollToBottom();
  }
}

// === Per-message actions (copy / regenerate) ===
const COPY_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const REGEN_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';

function addMessageActions(body, getText, getRaw) {
  // Only the newest AI message can regenerate — retire older regen buttons
  document.querySelectorAll('.msg-actions .regen-btn').forEach(b => b.remove());

  let row = body.querySelector('.msg-actions');
  if (!row) {
    row = document.createElement('div');
    row.className = 'msg-actions';
    body.appendChild(row);
  }
  row.innerHTML = '';

  const copy = document.createElement('button');
  copy.className = 'msg-action-btn';
  copy.innerHTML = COPY_SVG + '<span>Copy</span>';
  copy.addEventListener('click', () => {
    navigator.clipboard.writeText(getText());
    const span = copy.querySelector('span');
    span.textContent = 'Copied!';
    setTimeout(() => span.textContent = 'Copy', 1500);
  });
  row.appendChild(copy);

  const regen = document.createElement('button');
  regen.className = 'msg-action-btn regen-btn';
  regen.innerHTML = REGEN_SVG + '<span>Regenerate</span>';
  regen.addEventListener('click', regenerate);
  row.appendChild(regen);

  // Debug aid: copy the exact raw payload (reasoning channel, content,
  // finish reason) so rendering issues can be diagnosed from ground truth.
  if (getRaw) {
    const raw = document.createElement('button');
    raw.className = 'msg-action-btn';
    raw.innerHTML = '<span>Raw</span>';
    raw.title = 'Copy the raw model output for debugging';
    raw.addEventListener('click', () => {
      navigator.clipboard.writeText(getRaw());
      const span = raw.querySelector('span');
      span.textContent = 'Copied!';
      setTimeout(() => span.textContent = 'Raw', 1500);
    });
    row.appendChild(raw);
  }
}

// === Auto-naming chats ===
// After the first exchange, quietly ask the model for a 3–5 word title.
async function maybeAutoName() {
  const session = state.sessions.find(s => s.id === state.currentSessionId);
  if (!session || session.customTitle || session.autoNamed) return;
  if (state.messages.filter(m => m.role === 'assistant').length !== 1) return;
  session.autoNamed = true; // one attempt only, even if it fails

  const userText = extractText(state.messages.find(m => m.role === 'user')?.content || '').slice(0, 400);
  const aiText = extractText(state.messages.find(m => m.role === 'assistant')?.content || '').slice(0, 400);
  // Always name via LM Studio direct — a cheap one-off that shouldn't spin up a
  // workspace's retrieval/agent flow. Falls back to the active model only if no
  // LM Studio model is available.
  const namingModel = firstLmModelId() || activeModelId();
  try {
    const resp = await fetch(state.apiBase + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: namingModel || undefined,
        messages: [{ role: 'user', content: `Write a short title (3-5 words) summarizing this conversation. Reply with ONLY the title — no quotes, no punctuation around it, no explanation.\n\nUser: ${userText}\nAssistant: ${aiText}` }],
        temperature: 0.3,
        max_tokens: 400, // headroom for models that think before answering
        stream: false,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!resp.ok) return;
    const data = await resp.json();
    let title = data.choices?.[0]?.message?.content || '';
    // Strip any thinking/special tokens, take the last non-empty line
    title = title.replace(/<think(?:ing)?>[\s\S]*?(<\/think(?:ing)?>|$)/gi, '');
    title = stripSpecialTokens(title);
    const lines = title.split('\n').map(l => l.trim()).filter(Boolean);
    title = (lines[lines.length - 1] || '').replace(/^["'“”]+|["'“”.]+$/g, '').trim();
    if (!title || title.length > 80) return;
    session.title = title;
    persistSessions();
    renderHistoryList();
  } catch (e) { /* best-effort — placeholder title stays */ }
}

// === HTML preview (artifacts-lite) ===
function openPreview(html) {
  const modal = $('#preview-modal');
  const frame = $('#preview-frame');
  frame.srcdoc = html;
  modal.classList.remove('hidden');
}

function closePreview() {
  const modal = $('#preview-modal');
  const frame = $('#preview-frame');
  frame.srcdoc = '';
  modal.classList.add('hidden');
}

function stopStreaming() {
  if (state.abortController) state.abortController.abort();
}

function newChat() {
  state.messages = [];
  state.currentSessionId = null;
  clearAttachments();
  messagesEl.innerHTML = '';
  if (welcome) messagesEl.appendChild(welcome);
  showWelcome(true);
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
  if (!session.customTitle && !session.autoNamed) session.title = sessionTitle(state.messages);
  session.model = state.currentModel;
  session.backend = state.currentBackend;
  session.settings = {
    temperature: parseFloat(tempSlider.value),
    maxTokens: parseInt(tokensSlider.value),
    systemPrompt: systemPrompt.value,
  };
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

  // Restore the chat's model + backend if that option still exists (LM Studio
  // model still loaded, or workspace still available).
  const wantBackend = session.backend || 'lmstudio';
  const opt = session.model && [...modelSelect.options].find(
    o => o.value === session.model && o.dataset.backend === wantBackend);
  if (opt) {
    modelSelect.value = session.model;
    state.currentModel = session.model;
    state.currentBackend = wantBackend;
    refreshModelCaps();
  }
  // Restore the chat's settings
  if (session.settings) {
    const st = session.settings;
    if (st.temperature != null) { tempSlider.value = st.temperature; tempValue.textContent = tempSlider.value; }
    if (st.maxTokens != null) { tokensSlider.value = st.maxTokens; tokensValue.textContent = tokensSlider.value; }
    if (st.systemPrompt != null) systemPrompt.value = st.systemPrompt;
    saveSettings();
  }

  messagesEl.innerHTML = '';
  if (welcome) messagesEl.appendChild(welcome);
  showWelcome(false);
  state.messages.forEach(renderStoredMessage);
  scrollToBottom(true);

  // Keep the sidebar open on desktop (push mode); close it on phones
  if (window.innerWidth < 768) closeHistory();
  // Update highlight in place — rebuilding the list here would destroy the
  // title node mid-double-click and break rename.
  updateActiveHistoryItem();
}

function updateActiveHistoryItem() {
  historyList.querySelectorAll('.history-item').forEach(li =>
    li.classList.toggle('active', li.dataset.id === state.currentSessionId));
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
const PIN_SVG = (filled) => `<svg width="15" height="15" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M12 17v5"/><path d="M9 10.76V7a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3.76a2 2 0 0 0 .59 1.42l1.7 1.7a1 1 0 0 1-.7 1.7H6.41a1 1 0 0 1-.7-1.7l1.7-1.7A2 2 0 0 0 8 10.76z"/></svg>`;

function togglePin(id) {
  const s = state.sessions.find(x => x.id === id);
  if (!s) return;
  s.pinned = !s.pinned;
  persistSessions();
  renderHistoryList();
}

function startRename(session, titleEl) {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = session.title || '';
  titleEl.textContent = '';
  titleEl.appendChild(input);
  input.focus();
  input.select();

  let done = false;
  const commit = (save) => {
    if (done) return;
    done = true;
    const v = input.value.trim();
    if (save && v && v !== session.title) {
      session.title = v.slice(0, 80);
      session.customTitle = true;
      persistSessions();
    }
    input.remove(); // must go before re-render: the rename guard checks for it
    renderHistoryList();
  };
  input.addEventListener('click', e => e.stopPropagation());
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') commit(true);
    else if (e.key === 'Escape') commit(false);
  });
  input.addEventListener('blur', () => commit(true));
}

// Bucket sessions Claude-style: Pinned, Today, Yesterday, Previous 7 days, Older.
function groupSessions(sessions) {
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const dayMs = 86400000;
  const yesterday = startOfToday.getTime() - dayMs;
  const weekAgo = startOfToday.getTime() - 7 * dayMs;

  const groups = [
    { label: 'Pinned', items: [] },
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Previous 7 days', items: [] },
    { label: 'Older', items: [] },
  ];
  sessions.forEach(s => {
    if (s.pinned) return groups[0].items.push(s);
    const t = s.updatedAt || s.createdAt || 0;
    if (t >= startOfToday.getTime()) groups[1].items.push(s);
    else if (t >= yesterday) groups[2].items.push(s);
    else if (t >= weekAgo) groups[3].items.push(s);
    else groups[4].items.push(s);
  });
  return groups.filter(g => g.items.length);
}

function renderHistoryList() {
  if (!historyList) return;
  // Don't rebuild while a rename is in progress — it would destroy the input
  const renaming = historyList.querySelector('.history-item-title input');
  if (renaming && document.activeElement === renaming) return;
  historyList.innerHTML = '';

  const q = (historySearch?.value || '').trim().toLowerCase();
  let sessions = state.sessions;
  if (q) {
    sessions = sessions.filter(s =>
      (s.title || '').toLowerCase().includes(q) ||
      (s.messages || []).some(m => extractText(m.content).toLowerCase().includes(q))
    );
  }

  if (!sessions.length) {
    historyEmpty.textContent = q ? 'No matching chats.' : 'No saved chats yet.';
    historyEmpty.classList.remove('hidden');
    return;
  }
  historyEmpty.classList.add('hidden');

  groupSessions(sessions).forEach(group => {
    const header = document.createElement('li');
    header.className = 'history-group';
    header.textContent = group.label;
    historyList.appendChild(header);

    group.items.forEach(session => {
      const li = document.createElement('li');
      li.className = 'history-item' + (session.id === state.currentSessionId ? ' active' : '');
      li.dataset.id = session.id;

      const main = document.createElement('div');
      main.className = 'history-item-main';
      const title = document.createElement('div');
      title.className = 'history-item-title';
      title.textContent = session.title || 'New chat';
      title.title = 'Double-click to rename';
      title.addEventListener('dblclick', e => { e.stopPropagation(); startRename(session, title); });
      const time = document.createElement('div');
      time.className = 'history-item-time';
      time.textContent = relTime(session.updatedAt);
      main.appendChild(title);
      main.appendChild(time);
      main.addEventListener('click', () => loadSession(session.id));

      const pin = document.createElement('button');
      pin.className = 'history-pin' + (session.pinned ? ' pinned' : '');
      pin.setAttribute('aria-label', session.pinned ? 'Unpin chat' : 'Pin chat');
      pin.innerHTML = PIN_SVG(!!session.pinned);
      pin.addEventListener('click', e => { e.stopPropagation(); togglePin(session.id); });

      const del = document.createElement('button');
      del.className = 'history-delete';
      del.setAttribute('aria-label', 'Delete chat');
      del.innerHTML = TRASH_SVG;
      del.addEventListener('click', e => { e.stopPropagation(); deleteSession(session.id); });

      li.appendChild(main);
      li.appendChild(pin);
      li.appendChild(del);
      historyList.appendChild(li);
    });
  });
}

function openHistory() {
  renderHistoryList();
  historyPanel.classList.remove('hidden');
  historyOverlay.classList.remove('hidden'); // hidden on wide screens via CSS
  appEl.classList.add('history-open');        // pushes content over on desktop
}

function closeHistory() {
  historyPanel.classList.add('hidden');
  historyOverlay.classList.add('hidden');
  appEl.classList.remove('history-open');
}

function toggleHistory() {
  if (historyPanel.classList.contains('hidden')) openHistory();
  else closeHistory();
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

// Splits a mixed file list (from the picker or a drag-drop) into images vs
// everything else, routing each to its handler.
function handleAttachedFiles(files) {
  if (!files.length) return;
  const images = files.filter(f => f.type.startsWith('image/'));
  const texts = files.filter(f => !f.type.startsWith('image/'));
  if (images.length) {
    if (state.modelCaps.vision) handleImageFiles(images);
    else alert('The current model doesn\'t support images.');
  }
  if (texts.length) handleTextFiles(texts);
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

const TEXT_FILE_RE = /\.(txt|md|markdown|json|csv|tsv|log|js|jsx|ts|tsx|py|html?|css|scss|xml|ya?ml|toml|ini|sh|bash|java|c|h|cpp|hpp|cs|go|rs|rb|php|sql|swift|kt|r)$/i;

async function handleTextFiles(files) {
  for (const file of files) {
    if (!file.type.startsWith('text/') && !TEXT_FILE_RE.test(file.name)) {
      alert(`"${file.name}" isn't a supported text file and was skipped.`);
      continue;
    }
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

  if (anythingSave) anythingSave.addEventListener('click', applyAnythingLLM);

  disconnectBtn.addEventListener('click', () => {
    closeSidebar();
    showSetup();
  });

  // Settings
  tempSlider.addEventListener('input', () => { tempValue.textContent = tempSlider.value; saveSettings(); });
  tokensSlider.addEventListener('input', () => { tokensValue.textContent = tokensSlider.value; saveSettings(); });
  systemPrompt.addEventListener('change', saveSettings);
  streamToggle.addEventListener('change', saveSettings);
  collapseToggle.addEventListener('change', saveSettings);

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

  // Attachments — one button/input covers both, so mobile browsers show
  // their native "Take Photo / Photo Library / Browse Files" sheet.
  attachFileBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => { handleAttachedFiles([...e.target.files]); e.target.value = ''; });
  userInput.addEventListener('paste', e => {
    if (!state.modelCaps.vision) return;
    const imgs = [...(e.clipboardData?.items || [])]
      .filter(it => it.kind === 'file' && it.type.startsWith('image/'))
      .map(it => it.getAsFile())
      .filter(Boolean);
    if (imgs.length) { e.preventDefault(); handleImageFiles(imgs); }
  });

  // History panel
  historyBtn.addEventListener('click', toggleHistory);
  historyClose.addEventListener('click', closeHistory);
  historyOverlay.addEventListener('click', closeHistory);
  historyNew.addEventListener('click', () => { newChat(); if (window.innerWidth < 768) closeHistory(); });
  historySearch.addEventListener('input', renderHistoryList);

  // Scroll position / pill
  chatContainer.addEventListener('scroll', onChatScroll);
  scrollPill.addEventListener('click', () => scrollToBottom(true));

  // HTML preview modal
  $('#preview-close').addEventListener('click', closePreview);
  $('#preview-modal').addEventListener('click', e => { if (e.target.id === 'preview-modal') closePreview(); });

  // Drag-and-drop attachments (anywhere on the page)
  document.addEventListener('dragover', e => {
    e.preventDefault();
    if (state.connected) composerEl.classList.add('drag-over');
  });
  document.addEventListener('dragleave', e => {
    if (!e.relatedTarget) composerEl.classList.remove('drag-over');
  });
  document.addEventListener('drop', e => {
    e.preventDefault();
    composerEl.classList.remove('drag-over');
    if (!state.connected) return;
    handleAttachedFiles([...(e.dataTransfer?.files || [])]);
  });

  // Reconnect when tab becomes visible
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.apiBase && !state.connected && !state.streaming) connect();
  });

  // Tie #app's actual height to the real visible viewport instead of a CSS
  // viewport unit. `dvh` only reacts to browser chrome (address bar)
  // show/hide, not the on-screen keyboard, so without this the layout stays
  // full-height while the keyboard covers part of it — which is exactly
  // when mobile browsers kick in their own "scroll the focused input into
  // view" behavior and yank the whole page up. Once #app's height matches
  // window.visualViewport.height, the flex layout already fits the visible
  // area (composer right above the keyboard, chat area shrunk to match),
  // so there's nothing left for the browser to scroll.
  if (window.visualViewport) {
    const vv = window.visualViewport;
    // Safari can also pan the *visual* viewport itself (a compositor-level
    // offset, separate from any DOM scroll position) to bring a focused
    // input into view — it does this because none of our ancestors are
    // scrollable, so it's WebKit's fallback. That pan doesn't clear itself
    // and isn't blocked by overflow/position tricks; window.scrollTo(0, 0)
    // is what actually resets it.
    const resetScroll = () => {
      window.scrollTo(0, 0);
      document.body.scrollTop = 0;
      document.documentElement.scrollTop = 0;
    };
    const syncAppHeight = () => {
      document.documentElement.style.setProperty('--app-height', vv.height + 'px');
      resetScroll();
    };
    vv.addEventListener('resize', syncAppHeight);
    vv.addEventListener('scroll', syncAppHeight);
    syncAppHeight();

    // The keyboard-open animation settles after the resize/scroll events
    // fire, so re-assert a few times to catch WebKit's pan once it's done.
    userInput.addEventListener('focus', () => {
      resetScroll();
      setTimeout(resetScroll, 50);
      setTimeout(resetScroll, 150);
      setTimeout(resetScroll, 350);
    });
  }
}

// === Service Worker ===
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// === Start ===
init();
