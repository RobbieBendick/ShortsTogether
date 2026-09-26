# ShortsTogether

Shared YouTube Shorts player (like Watch2Gether) + Chrome extension feed bridge.

## Live

- **Web app:** GitHub Pages (this repo)
- **Sync server:** `wss://shortstogetherbackend.onrender.com`

## Local web app

```bash
cd client
npm install
npm run dev
```

## GitHub Pages

Push to `main` / `dev` — the Actions workflow builds `client/` and deploys Pages.

One-time setup on GitHub:

1. **Settings ? Pages ? Build and deployment ? Source:** GitHub Actions
2. Ensure Actions are enabled for the repo

Site URL will be:

```text
https://<user>.github.io/<repo>/
```

## Extension

Load `extension/` via `chrome://extensions` ? Load unpacked. Point it at the same room code + `wss://shortstogetherbackend.onrender.com`.
