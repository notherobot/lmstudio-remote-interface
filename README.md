# LM Studio Chat

A clean chat interface for your local LLM running in [LM Studio](https://lmstudio.ai/). Open the HTML file, start chatting — no setup required.

## Usage

1. Open **LM Studio** and load a model
2. Go to the **Developer** tab and click **Start Server** (runs on `127.0.0.1:1234`)
3. Open `index.html` in your browser
4. Chat

The app auto-connects when the page loads. If LM Studio isn't running yet, it retries automatically.

## Features

- Streaming responses with stop button
- Model selector (auto-populated from LM Studio)
- Markdown rendering with syntax-highlighted code blocks
- Copy button on code blocks
- System prompt configuration
- Temperature and max tokens sliders
- New chat button
- Dark theme
- PWA — works offline once loaded

## Planned

- Voice chat
- File attachments

## How It Works

The app calls LM Studio's OpenAI-compatible local API:
- `GET /v1/models` — lists loaded models
- `POST /v1/chat/completions` — sends messages, streams responses

Everything runs locally. No data leaves your machine.

## License

MIT
