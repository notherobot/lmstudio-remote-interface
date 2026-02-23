# LM Studio Chat

A personal chat interface hosted on GitHub Pages that connects to LM Studio running on your PC via Tailscale. Access your local LLM from your phone, tablet, or any browser — anywhere.

**Live URL:** https://notherobot.github.io/lmstudio-remote-interface/

---

## How It Works

```
Your browser (phone, tablet, laptop — anywhere)
    → loads the page from GitHub Pages
    → sends messages to your PC over Tailscale
    → LM Studio processes them locally
    → responses stream back to your browser
```

Tailscale gives your PC a stable private IP (like `100.x.x.x`) that works from any of your devices. No port forwarding, no tunnels to start, no URLs that change. Just works.

---

## Setup

### 1. Install Tailscale on your PC and phone

- **PC:** https://tailscale.com/download
- **iPhone:** App Store → "Tailscale"
- **Android:** Play Store → "Tailscale"

Sign in with the same account on all devices.

### 2. Start LM Studio's server

1. Open LM Studio on your PC
2. Load a model
3. **Developer** tab → **Start Server** (port `1234`)
4. In **Server Settings**:
   - Turn on **Enable CORS**
   - Turn on **Serve on Local Network** (so it listens on `0.0.0.0`, not just localhost)

### 3. Find your Tailscale IP

Open the Tailscale app on your PC — your IP looks like `100.x.x.x`. You can also find it at https://login.tailscale.com/admin/machines.

### 4. Connect

1. Open https://notherobot.github.io/lmstudio-remote-interface/ on your phone
2. Enter `100.x.x.x:1234` (your Tailscale IP + LM Studio port)
3. Tap **Connect**
4. Done — start chatting

The IP is saved in your browser. Next time you open the page, it connects automatically.

---

## On the Same PC

No Tailscale needed. On the setup screen, click the **localhost:1234** link.

---

## Features

- Streaming responses with stop button
- Model selector (auto-populated from LM Studio)
- Markdown rendering with code block copy buttons
- System prompt, temperature, max tokens
- New chat button
- Saves connection and settings to localStorage
- Auto-reconnects if connection drops
- PWA — add to home screen on mobile

## Planned

- Voice chat
- File attachments
- Native Android / iOS app

---

## Security

- **Tailscale is end-to-end encrypted** — all traffic between your phone and PC uses WireGuard encryption. Nothing passes through any third-party server.
- **Private network** — your Tailscale IP is only reachable by your own devices. Nobody else on the internet can access it.
- **Static page** — this GitHub Pages site has no backend, no database, no analytics. All API calls go directly from your browser to your PC.
- **Local storage only** — your Tailscale IP and settings are stored in your browser. They never leave your device.

---

## License

MIT
