# LM Studio Chat

A desktop chat interface for [LM Studio](https://lmstudio.ai/). Connects directly to LM Studio's local API server — just start LM Studio, run this app, and chat.

---

## Quick Start (Desktop App)

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [LM Studio](https://lmstudio.ai/) installed and running

### 1. Start LM Studio's Server

1. Open LM Studio
2. Load a model
3. Go to the **Developer** tab (left sidebar, `<>` icon)
4. Click **Start Server**
5. The server runs on `localhost:1234` by default

### 2. Run the Desktop App

```bash
git clone https://github.com/notherobot/lmstudio-remote-interface.git
cd lmstudio-remote-interface
npm install
npm start
```

That's it. The app auto-connects to `localhost:1234`.

If LM Studio uses a different port, just type the address (e.g. `localhost:5000`) in the connection screen.

---

## Using the Browser Version

You can also open `index.html` directly in your browser — no install needed:

1. Start LM Studio's server
2. Open `index.html` in Chrome/Edge/Firefox
3. It auto-connects to `localhost:1234`

Or use the hosted version: `https://notherobot.github.io/lmstudio-remote-interface/`

---

## Connecting from Another Device

To chat from your phone or another PC on the same network:

1. In LM Studio, set the server to listen on **`0.0.0.0`** (not localhost)
   - Look for "Serve on Local Network" in LM Studio's server settings
2. Find your PC's local IP (e.g. `192.168.1.100`)
   - Windows: run `ipconfig` in Command Prompt
   - Mac: run `ifconfig` in Terminal, look for `en0`
3. On your phone/other device, open the app and enter `192.168.1.100:1234`

---

## Features

- **Auto-connects** to `localhost:1234` — zero config if LM Studio uses defaults
- **Streaming responses** — see tokens as they arrive, with stop button
- **Model selector** — auto-populates from loaded models
- **Markdown rendering** — code blocks with copy button, tables, lists, etc.
- **System prompt** — configure in the settings sidebar
- **Temperature & max tokens** — adjustable sliders
- **Dark theme** — easy on the eyes
- **Connection memory** — saves your server address locally
- **Works offline** — PWA caching (browser version)
- **Desktop app** — Electron wrapper, runs like a native app

---

## LM Studio Server Settings

| Setting | Where to Find |
|---|---|
| Start/stop server | Developer tab → Start Server |
| Port number | Developer tab → shows `localhost:1234` (or custom) |
| Serve on network | Developer tab → toggle "Serve on Local Network" |
| Loaded model | Shows in the model dropdown at the top of LM Studio |
| CORS | Enabled by default in LM Studio |

The app uses LM Studio's **OpenAI-compatible API**:
- `GET /v1/models` — list loaded models
- `POST /v1/chat/completions` — send messages and get responses

---

## Development

```bash
# Run with dev tools open
npm run dev

# Or just open in browser for quick iteration
open index.html
```

The app is pure HTML/CSS/JS — edit any file and reload. No build step.

---

## Project Structure

```
├── index.html          # Main page
├── style.css           # Mobile-first dark theme
├── app.js              # Chat logic, streaming, connection
├── marked.min.js       # Markdown renderer
├── sw.js               # Service worker (PWA offline)
├── manifest.json       # PWA manifest
├── icon-192.png        # App icon
├── icon-512.png        # App icon (large)
├── electron/
│   └── main.js         # Electron desktop wrapper
├── package.json        # npm/electron config
└── README.md
```

---

## Security

- **All local** — the app talks directly to LM Studio on your machine (or your local network). No data goes to any external server.
- **No backend** — the GitHub Pages version is a static page. It has no server, no database, no analytics.
- **Local storage only** — settings are stored in your browser's localStorage. They never leave your device.
- **Open source** — all code is in this repository.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Could not connect" | Make sure LM Studio's server is running (Developer tab → Start Server) |
| No models in dropdown | Load a model in LM Studio first |
| Can't connect from phone | Set LM Studio to serve on `0.0.0.0`, use your PC's local IP |
| CORS errors | Update LM Studio to latest version (CORS is enabled by default) |
| Electron won't start | Run `npm install` first to install dependencies |

---

## License

MIT
