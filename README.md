---
title: Richmond Token Check
emoji: 🕵️
colorFrom: blue
colorTo: purple
sdk: docker
pinned: false
app_port: 7860
---

# Richmond Token Check

A stealthy, automated tool to check access codes for Richmond LP.

## Features
- **Stealth Mode**: Uses `playwright-extra` and `puppeteer-extra-plugin-stealth` to evade bot detection.
- **Session Persistence**: Maintains browser session for 15 minutes to avoid re-login loops.
- **Robust Search**: Recursively searches frames and handles hidden inputs automatically.
- **Deployment**: Configured for Hugging Face Spaces (Docker).

## API
- `POST /api/check-access-code`: Checks a specific code.
- `GET /api/status`: Returns system status and readiness.
- `GET /api/logs`: Returns real-time logs.
