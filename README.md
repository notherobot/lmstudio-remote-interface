# LM Studio Remote Interface

A mobile-friendly web app for chatting with [LM Studio](https://lmstudio.ai/) running on your PC — accessible from any browser on your phone or tablet over [Tailscale](https://tailscale.com/).

**Live URL:** `https://notherobot.github.io/lmstudio-remote-interface/`

---

## Quick Start

1. Open the live URL on your phone's browser
2. Enter your LM Studio server address (e.g. `100.64.0.1:1234`)
3. Start chatting

That's it. The page remembers your connection info.

---

## Setup Guide

### 1. Install Tailscale (one-time)

Tailscale creates a private, encrypted network between your devices.

- **PC:** Download from [tailscale.com/download](https://tailscale.com/download) and sign in
- **iPhone:** Install from the [App Store](https://apps.apple.com/app/tailscale/id1470499037)
- **Android:** Install from [Google Play](https://play.google.com/store/apps/details?id=com.tailscale.ipn)

Sign in with the same account on all devices.

### 2. Enable LM Studio's API Server

1. Open LM Studio on your PC
2. Go to the **Developer** tab (or **Local Server** in older versions)
3. Load a model
4. Click **Start Server**
5. **Important:** Set the server to listen on `0.0.0.0` (all interfaces), not just `localhost`
   - In LM Studio settings, look for "Serve on Local Network" or set the host to `0.0.0.0`
6. Note the port number (default is `1234`)

### 3. Find Your Tailscale IP

- Open the Tailscale app on your PC
- Your IP looks like `100.x.x.x`
- You can also find it at [login.tailscale.com/admin/machines](https://login.tailscale.com/admin/machines)

### 4. Connect

1. Open this app in your phone's browser
2. Enter: `100.x.x.x:1234` (your Tailscale IP + LM Studio port)
3. Tap **Connect**
4. Select a model from the dropdown
5. Start chatting

### 5. Bookmark for Quick Access

**iPhone (Add to Home Screen):**
1. Open the page in Safari
2. Tap the Share button (square with arrow)
3. Tap "Add to Home Screen"
4. It will open like a native app

**Android:**
1. Open the page in Chrome
2. Tap the three-dot menu
3. Tap "Add to Home screen" or "Install app"

---

## Features

- **Mobile-first design** — optimized for phone screens
- **Streaming responses** — see tokens as they arrive
- **Markdown rendering** — code blocks, tables, lists, etc.
- **Model selection** — pick from loaded models
- **System prompt** — configure assistant behavior
- **Temperature & max tokens** — adjustable generation settings
- **Connection memory** — saves your server address locally
- **Works offline** — PWA with service worker caching
- **Stop generation** — cancel responses mid-stream
- **Copy code blocks** — one-tap copy for code snippets

---

## Security

This app is designed to be secure by default:

- **Tailscale provides end-to-end encryption** — all traffic between your phone and PC is encrypted using WireGuard. No data passes through any third-party server.
- **Static webpage** — this site is a static page hosted on GitHub Pages. It has no backend, no database, no analytics, no tracking.
- **Direct browser-to-PC communication** — API calls go directly from your browser to your LM Studio instance over Tailscale. Nothing is proxied.
- **Local storage only** — your server address and settings are stored in your browser's localStorage. They never leave your device.
- **No API keys needed** — LM Studio's local server doesn't require authentication, and Tailscale's network-level security makes this safe.
- **Open source** — all code is in this repository. Inspect it yourself.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Could not connect" | Make sure LM Studio's server is running and set to `0.0.0.0` (not `localhost`) |
| No models in dropdown | Load a model in LM Studio before connecting |
| Timeout errors | Check that Tailscale is active on both devices |
| CORS errors | LM Studio includes CORS headers by default; make sure you're on a recent version |
| Page won't load on phone | Ensure your phone has internet access (needed to load the page the first time) |

---

## Tech Stack

- Pure HTML, CSS, JavaScript — no build step, no frameworks
- Fetch API with streaming (ReadableStream)
- Service Worker for offline PWA support
- Lightweight built-in markdown renderer
- CSS custom properties for theming
- `safe-area-inset` support for notched devices

---

## License

MIT
