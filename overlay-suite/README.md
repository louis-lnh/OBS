# LUIGI Overlay Suite

Local React overlay system for OBS browser sources.

## Run

```bash
npm install
npm run dev
```

The local helper server runs on `https://localhost:5173`. It serves the overlay, Spotify API routes, and Twitch API routes on the same port.

For VPS production, run the overlay as plain HTTP behind nginx/Caddy:

```env
HOST=127.0.0.1
PORT=5173
OVERLAY_LOCAL_HTTPS=false
SPOTIFY_REDIRECT_URI=https://obsoverlay.shd-esports.com/api/spotify/callback
TWITCH_REDIRECT_URI=https://obsoverlay.shd-esports.com/api/twitch/callback
```

Then use `https://obsoverlay.shd-esports.com/luigi_ay/gameplay` in OBS.

## OBS Browser Source URLs

Use the widget URLs as `1920x1080` browser sources with transparency enabled. The visible widget is already positioned on the full canvas, so OBS should not need to crop, enlarge, or rescale it.

```text
https://localhost:5173/
https://localhost:5173/gameplay
https://localhost:5173/layout
https://localhost:5173/starting
https://localhost:5173/brb
https://localhost:5173/hud
https://localhost:5173/spotify
https://localhost:5173/challenge?mode=timer
https://localhost:5173/challenge?mode=lifesteal
https://localhost:5173/challenge?mode=valorant
https://localhost:5173/camera-frame
https://localhost:5173/chat-widget
https://localhost:5173/chat-widget-clean
https://localhost:5173/alert-widget?type=follower
https://localhost:5173/alert-widget?type=sub
https://localhost:5173/alert-widget?type=donation
https://localhost:5173/config
```

## Main Gameplay Overlay

Use this as the single 1920x1080 OBS browser source for the current gameplay layout:

```text
https://localhost:5173/gameplay
```

If OBS shows a blank browser source with the HTTPS URL, use the local HTTP mirror instead:

```text
http://127.0.0.1:5174/gameplay
```

The HTTPS URL is still useful for Twitch/Spotify OAuth in a normal browser, but OBS may reject the local self-signed certificate silently.

Optional query settings:

```text
https://localhost:5173/gameplay?info=spotify
https://localhost:5173/gameplay?info=valorant
https://localhost:5173/gameplay?info=valorant&valorant=premier
https://localhost:5173/gameplay?info=lifesteal
https://localhost:5173/gameplay?info=timer
https://localhost:5173/gameplay?ad=minecraft
```

The page contains the 16:9 camera frame, right-side alert panel, one configurable info bar above camera, subtle bottom-left advertising, and bottom-right goals. Chat is intentionally not included in this page for now, so it can stay borderless through Streamlabs or be added later as a custom text-only widget.

## Local HTTPS Setup

Twitch requires an HTTPS OAuth redirect URL. The local helper server auto-generates a development certificate at `.local/localhost-key.pem` and `.local/localhost-cert.pem` when it starts.

The first browser visit to `https://localhost:5173/config` may show a local certificate warning. Continue through it once for local development.

## Spotify Setup

The Spotify widget needs a local OAuth connection. OBS does not need a plugin.

1. Create a Spotify app at the Spotify Developer Dashboard.
2. Add this redirect URI to that app:

```text
https://localhost:5173/api/spotify/callback
```

3. Copy `.env.example` to `.env`.
4. Fill in `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`.
5. Start the overlay server:

```bash
npm run dev
```

6. Open:

```text
https://localhost:5173/config
```

7. Click `Connect Spotify` and finish the Spotify login.

After that, use `https://localhost:5173/spotify` as the OBS browser source. The local server stores refresh tokens in `.local/spotify-tokens.json`, which is ignored by git and not bundled into the overlay.

## Twitch Setup

The chat and alert widgets use Twitch EventSub through the local helper server. OBS does not need a plugin or Twitch credentials.

1. Create a Twitch app in the Twitch Developer Console.
2. Add this OAuth redirect URL to that app:

```text
https://localhost:5173/api/twitch/callback
```

3. Copy `.env.example` to `.env` if you have not already.
4. Fill in:

```env
TWITCH_CLIENT_ID=your_twitch_client_id
TWITCH_CLIENT_SECRET=your_twitch_client_secret
TWITCH_REDIRECT_URI=https://localhost:5173/api/twitch/callback
TWITCH_CHANNEL=luigi_ay
HTTPS_KEY_FILE=.local/localhost-key.pem
HTTPS_CERT_FILE=.local/localhost-cert.pem
```

5. Start the overlay server:

```bash
npm run dev
```

6. Open:

```text
https://localhost:5173/config
```

7. Click `Connect Twitch` and authorize with the broadcaster account.

After that, `https://localhost:5173/chat-widget`, `https://localhost:5173/chat-widget-clean`, and `https://localhost:5173/alert-widget` read live Twitch data. The local server stores refresh tokens in `.local/twitch-tokens.json`, which is ignored by git and not bundled into the overlay.

## Lifesteal Setup

The Lifesteal widget polls the Discord bot overlay endpoint:

```env
VITE_LIFESTEAL_OVERLAY_URL=http://127.0.0.1:3000/api/v1/overlays/lifesteal/player
VITE_LIFESTEAL_OVERLAY_TOKEN=
```

Set `VITE_LIFESTEAL_OVERLAY_TOKEN` to the bot's `OVERLAY_PUBLIC_TOKEN` if the bot protects the endpoint.

## Widget Positions

Current layout is based on the camera stack sketch:

- Spotify: above Camera 1, top left.
- Challenge/timer: directly right of Spotify.
- Camera frame: aligned to Camera 1 with transparent center and bottom logo mark.
- Chat: beneath Camera 1.
- Alerts: centered upper-middle as a standalone transparent source.

## Current State

- Spotify, Twitch chat, Twitch alerts, timer state, and Lifesteal polling are wired through the local helper server or local browser state.
- Valorant and some scene countdown copy are still manual data in `src/overlayConfig.ts`.
- Visual system is defined in `src/App.css` and `src/index.css`.
- Data source can later be swapped to local JSON, Stream Deck actions, Spotify API, Riot API, or Minecraft mod endpoints without redesigning the overlay components.

## Future Valorant Widget Notes

- Start with a local config/control page for rank rating.
- Set current RR at the start of stream/session, then manually update after each game.
- This avoids needing a Riot-approved app for the first version.
- Later idea: use a chat bot linked to the Valorant account. A command like `!rr` could output current rank, current RR, and session stats. If the overlay can read or receive that bot message, it could parse the response and update the Valorant widget automatically.
- Keep the widget data-source agnostic so manual config, chat parsing, or a future official API can all feed the same visual component.

## Suggested Next Steps

1. Add a small control dashboard for Lifesteal hearts, timers, and Valorant RR.
2. Package individual widgets as cropped OBS browser sources.
4. Package individual widgets as cropped OBS browser sources.
