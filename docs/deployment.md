# SHD Stream Suite Deployment

This repo is intended to run on one VPS.

## Services

- `shd-twitch-bot`: Twitch chat bot, Channel Points rewards, song requests, SHD tokens.
- `shd-overlay`: OBS overlay web server, Twitch chat/alerts, Spotify, overlay state API.
- Static site files in `site/`: viewer-facing command/reward page.

## Recommended URLs

```text
https://obsoverlay.shd-esports.com/luigi_ay/gameplay
https://obsoverlay.shd-esports.com/luigi_ay/config
https://shd-esports.com/twitch/bot-info/
```

OBS should use the `/luigi_ay/gameplay` URL as a `1920x1080` browser source.

## VPS Install

```bash
git clone <repo-url> /opt/shd-stream-suite
cd /opt/shd-stream-suite
npm ci
npm --prefix overlay-suite ci
npm run build
npm run check:all
```

Create real `.env` files from the examples:

```bash
cp .env.example .env
cp overlay-suite/.env.example overlay-suite/.env
```

Do not commit `.env`, `.local`, tokens, or `node_modules`.

## Bot `.env`

The bot needs the bot account token for chat and the broadcaster token for direct Channel Points redemptions.

```env
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
TWITCH_REDIRECT_URI=https://localhost:3000/callback
TWITCH_ACCESS_TOKEN=
TWITCH_REFRESH_TOKEN=
TWITCH_BROADCASTER_ACCESS_TOKEN=
TWITCH_BROADCASTER_REFRESH_TOKEN=
TWITCH_BOT_USERNAME=shd_ttv_bot
TWITCH_BOT_USER_ID=
TWITCH_CHANNEL_NAME=luigi_ay
TWITCH_CHANNEL_ID=
BOT_OWNERS=luigi_ay
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REFRESH_TOKEN=
OVERLAY_CONTROL_URL=http://127.0.0.1:5173
```

The token refresh helpers write rotated Twitch refresh tokens back into `.env`, so the file must be writable by the process user.

## Overlay `.env`

The overlay runs plain HTTP locally behind nginx/Caddy TLS.

```env
HOST=127.0.0.1
PORT=5173
OVERLAY_LOCAL_HTTPS=false

SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REFRESH_TOKEN=
SPOTIFY_REDIRECT_URI=https://obsoverlay.shd-esports.com/api/spotify/callback

TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
TWITCH_REDIRECT_URI=https://obsoverlay.shd-esports.com/api/twitch/callback
TWITCH_CHANNEL=luigi_ay
TWITCH_CHANNEL_ID=

VITE_LIFESTEAL_OVERLAY_URL=
VITE_LIFESTEAL_OVERLAY_TOKEN=
```

Add the public redirect URLs to the matching Spotify and Twitch developer apps.

## PM2

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Useful commands:

```bash
pm2 logs shd-twitch-bot
pm2 logs shd-overlay
pm2 restart shd-twitch-bot
pm2 restart shd-overlay
```

## nginx Example

Overlay subdomain:

```nginx
server {
  server_name obsoverlay.shd-esports.com;

  location / {
    proxy_pass http://127.0.0.1:5173;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

Command page on the main domain:

```nginx
location /twitch/bot-info/ {
  alias /opt/shd-stream-suite/site/twitch/bot-info/;
  try_files $uri $uri/ /twitch/bot-info/index.html;
}
```

Use certbot or Caddy for TLS.

## Deployment Flow

```bash
cd /opt/shd-stream-suite
git pull
npm ci
npm --prefix overlay-suite ci
npm run build
npm run check:all
pm2 restart ecosystem.config.cjs
```

## Production Notes

- The overlay state is stored in `overlay-suite/.local/overlay-state.json`.
- Spotify/Twitch overlay OAuth tokens are stored in `overlay-suite/.local`.
- Bot Twitch tokens are stored in `.env` and auto-refresh.
- Keep the VPS firewall closed except SSH, HTTP, and HTTPS.
