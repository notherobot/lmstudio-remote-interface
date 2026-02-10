# LM Studio Chat

A chat interface for your local LLM running in [LM Studio](https://lmstudio.ai/). Runs as a desktop app or in the browser.

## Desktop App (Windows .exe)

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or newer

### Build the exe

```bash
git clone https://github.com/notherobot/lmstudio-remote-interface.git
cd lmstudio-remote-interface
npm install
npm run build
```

The `.exe` will be in `dist/`. It's a portable executable — no install needed, just double-click it.

### Run in dev mode

```bash
npm start
```

## LM Studio Setup

1. Open **LM Studio** and load a model
2. Go to the **Developer** tab
3. Click **Start Server** (runs on `127.0.0.1:1234`)
4. In **Server Settings**, turn on **Enable CORS**

The desktop app handles CORS automatically, but if you also use the browser version, CORS needs to be enabled.

## Browser Version

You can also just open `index.html` in your browser. Make sure CORS is enabled in LM Studio's Server Settings.

## Features

- Streaming responses with stop button
- Model selector (auto-populated from LM Studio)
- Markdown rendering with code block copy buttons
- System prompt configuration
- Temperature and max tokens sliders
- New chat button
- Dark theme
- Auto-connects and retries if LM Studio isn't running yet

## Planned

- Voice chat
- File attachments
- Android tablet app
- iOS app

## How It Works

The app calls LM Studio's OpenAI-compatible local API:
- `GET /v1/models` — lists loaded models
- `POST /v1/chat/completions` — sends messages, streams responses

Everything runs locally. No data leaves your machine.

## Project Structure

```
├── index.html          # UI (shared across desktop + mobile)
├── style.css           # Styles
├── app.js              # Chat logic
├── marked.min.js       # Markdown renderer
├── electron/
│   └── main.js         # Desktop app wrapper
├── package.json        # Build config
└── README.md
```

The web layer (`index.html`, `style.css`, `app.js`) is the shared core — the same code will be wrapped for Android/iOS later.

## License

MIT
