# Overlay Commands

OBS URL:

```text
http://127.0.0.1:5174/gameplay
```

State file:

```text
overlay-suite/.local/overlay-state.json
```

## Terminal

```powershell
npm run overlay:control -- state
npm run overlay:control -- cam on
npm run overlay:control -- cam off
npm run overlay:control -- info spotify
npm run overlay:control -- info valorant
npm run overlay:control -- info premier
npm run overlay:control -- info lifesteal
npm run overlay:control -- info timer
npm run overlay:control -- ad default
npm run overlay:control -- ad minecraft
npm run overlay:control -- goal followers 51 100
npm run overlay:control -- goal subs 2 10
npm run overlay:control -- goal lifesteal 8 50
npm run overlay:control -- countdown 2026-07-20T16:00:00Z
npm run overlay:control -- timer-title "LIFESTEAL COUNTDOWN" COUNTDOWN "START OF LIFESTEAL"
```

## Twitch Chat

Moderator-only:

```text
!overlay cam on
!overlay cam off
!overlay info spotify
!overlay info valorant
!overlay info premier
!overlay info lifesteal
!overlay info timer
!overlay ad default
!overlay ad minecraft
!overlay goal followers 51 100
!overlay goal subs 2 10
!overlay goal lifesteal 8 50
!overlay timer stopwatch
!overlay timer countdown 2026-07-20T16:00:00Z
!overlay timer label LIFESTEAL_COUNTDOWN COUNTDOWN START_OF_LIFESTEAL
```

Use underscores for multi-word timer labels in Twitch chat for now. Terminal commands can use quoted strings.

## API

```http
GET  /api/overlay/state
POST /api/overlay/state
GET  /api/overlay/goals
POST /api/overlay/info
POST /api/overlay/ad
POST /api/overlay/camera
POST /api/overlay/goals
POST /api/overlay/timer
```

Examples:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:5174/api/overlay/info -ContentType 'application/json' -Body '{"mode":"spotify"}'
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:5174/api/overlay/camera -ContentType 'application/json' -Body '{"enabled":false}'
```
