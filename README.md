# LM Studio Chat

A chat interface hosted on GitHub Pages that connects to LM Studio running on your PC. Access it from any browser, anywhere.

**Live URL:** https://notherobot.github.io/lmstudio-remote-interface/

---

## How It Works

```
Your browser (phone, laptop, anywhere)
    → loads the page from GitHub Pages
    → sends chat messages through your tunnel URL
    → LM Studio on your PC processes them
    → responses stream back to your browser
```

The page is static HTML — all the communication happens directly between your browser and your PC through a tunnel.

---

## Setup (one-time, ~5 minutes)

### 1. Start LM Studio's Server

1. Open LM Studio on your PC
2. Load a model
3. Go to the **Developer** tab
4. Click **Start Server** (default port `1234`)
5. Turn on **Enable CORS** in Server Settings

### 2. Expose It with a Tunnel

You need a tunnel so the GitHub Pages site can reach your PC from anywhere. Pick one:

#### Option A: Cloudflare Tunnel (recommended, free)

```bash
# Install (one-time)
# Windows: winget install cloudflare.cloudflared
# Mac: brew install cloudflared
# Linux: see https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

# Run the tunnel (do this each time)
cloudflared tunnel --url http://localhost:1234
```

It prints a URL like `https://something-random.trycloudflare.com` — copy that.

#### Option B: ngrok (free tier)

```bash
# Install from https://ngrok.com/download, then:
ngrok http 1234
```

It prints a URL like `https://xxxx-xx-xx.ngrok-free.app` — copy that.

### 3. Connect

1. Open https://notherobot.github.io/lmstudio-remote-interface/
2. Paste your tunnel URL
3. Click **Connect**
4. Chat

The URL is saved in your browser — next time you just open the page and it reconnects. If the tunnel URL changes (it does for free Cloudflare tunnels), paste the new one.

---

## Using on the Same PC

If you're on the same machine as LM Studio, no tunnel is needed. On the setup screen, click the **localhost:1234** link and you're connected.

---

## Features

- Streaming responses with stop button
- Model selector (auto-populated)
- Markdown rendering with code block copy buttons
- System prompt, temperature, max tokens
- New chat button
- Saves connection URL and settings to localStorage
- Auto-reconnects if connection drops
- PWA — add to home screen on mobile

---

## Security

- **Your tunnel, your control** — the tunnel runs on your PC and only exposes LM Studio's API port. Stop the tunnel and access is cut.
- **No middleman** — the GitHub Pages site is static. API calls go directly from your browser to your tunnel to your PC. Nothing is logged or proxied by this app.
- **Cloudflare tunnels are encrypted** — all traffic is HTTPS end-to-end.
- **Nothing stored server-side** — your tunnel URL and settings live only in your browser's localStorage.

---

## Planned

- Voice chat
- File attachments
- Android / iOS native app

---

## License

MIT
