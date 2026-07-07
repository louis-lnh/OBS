# SHD Twitch Chat Bot

Personal Twitch chat bot for SHD streams and friends. The first version is a local Node.js bot using Twitch EventSub WebSocket for chat messages and the Twitch Send Chat Message API for replies.

## What Works Now

- Connects to Twitch chat as a dedicated bot account.
- Replies to commands with `!ping`.
- Loads editable static commands from `data/commands.json`.
- Supports cooldowns and role checks.
- Lets mods manage commands with `!addcom`, `!editcom`, and `!delcom`.
- Supports `!commands`, `!uptime`, `!points`, `!watchtime`, `!daily`, `!top`, and `!gamble`.
- Supports simple giveaways with `!giveaway start`, `!join`, `!giveaway end`, and `!giveaway reroll`.
- Includes passive link, caps, and repeat-message filters that only log when enabled.
- Includes activity-aware timers from `data/timers.json`.
- Supports Spotify-backed song requests when Spotify credentials are configured.
- Supports fun/engagement commands, counters, polls, and local OBS placeholders.
- Uses `SHD tokens` for the lightweight gamble-only economy.
- Tracks users, first-time chatters, message counts, approximate watchtime, and streak-ish activity data.
- Exports a local command-list page to `public/commands.html`.
- Lets staff manually use `!ban`, `!unban`, and `!timeout`.
- Automatically bans only messages that match configured scam patterns.

## Setup

1. Install Node.js 20 or newer.
2. Run:

```bash
npm install
```

3. Copy `.env.example` to `.env` and fill in the values.
4. Create a Twitch developer app and authorize the bot account.

Minimum scopes for chat:

```txt
user:read:chat user:write:chat user:bot
```

The bot uses `TWITCH_REFRESH_TOKEN` to refresh expired access tokens automatically. On startup it validates the current token; if it is expired or close to expiry, it refreshes before connecting to EventSub. During normal API calls, a Twitch `401` also triggers one refresh and retry.

For ban, unban, and timeout commands, the bot account must be a channel moderator and the token needs:

```txt
moderator:manage:banned_users
```

For stream tools, useful extra scopes include:

```txt
channel:manage:broadcast
clips:edit
```

For optional EventSub reactions, enable them in `data/config.json` and add the matching scopes, such as `moderator:read:followers`, `channel:read:subscriptions`, or `bits:read`.

Spotify song requests need a Spotify app, a refresh token, and these scopes:

```txt
user-read-currently-playing user-read-playback-state user-modify-playback-state
```

Spotify queue/playback control requires Spotify Premium and an active playback device.

5. Start the bot:

```bash
npm run dev
```

## Editable Files

- `data/config.json` controls prefix, cooldowns, owners, admins, mods, and point settings.
- `data/commands.json` controls normal chat commands and responses.
- `data/points.json` stores user point balances.
- `data/warnings.json` stores warning history.
- `data/timers.json` stores automatic timer messages.
- `data/giveaway.json` stores the current giveaway state.
- `data/songQueue.json` stores song requests.
- `data/engagement.json` stores counters, lurkers, and polls.
- `data/streamState.json` stores local stream/OBS state.
- `data/users.json` stores first-seen, last-seen, and message-count data.
- `data/events.json` stores event reaction message templates.

## Useful First Commands

```txt
!ping
!discord
!sens
!rank
!setup
!rules
!socials
!crosshair
!tracker
!duo
!schedule
!commands
!command
!commandinfo
!addcom !command response text
!editcom !command new response text
!delcom !command
!uptime
!points
!watchtime
!top
!topup
!setpoints user 10 (owner only)
!gamble 50
!dice 50
!coinflip 50
!slots 50
!timeout user 60 spam
!ban user reason
!unban user
!giveaway start join
!giveaway open
!giveaway lock
!giveaway add user
!giveaway remove user
!giveaway restrict vip
!join
!giveaway status
!giveaway end
!giveaway reroll
!sr song or link
!queue
!queue pending
!approve songId
!skip
!deny songId
!clearsongs
!devices
!setdevice 1
!volume 50
!lurk
!unlurk
!hug user
!bonk user
!clutch
!death
!mald
!throw
!ace
!win
!loss
!poll start Question? yes | no
!vote 1
!8ball question
!rate thing
!choose a or b
!reload
```

## SHD Tokens

The currency is now `SHD tokens`. The current purpose is gambling only.

- Follows give 1 SHD token.
- Subs give 1 SHD token.
- Gift subs give 1 SHD token to the gifter and recipient when Twitch provides both users.
- `!topup` gives a viewer 1 SHD token only when they are at 0.
- Watchtime is shown through the Watchtime Channel Points reward. Direct `!watchtime` only explains how to use the reward.
- The channel owner can correct balances with `!setpoints user amount`.
- `!gamble`, `!dice`, `!coinflip`, and `!slots` are the main token sinks for now.

## Watchtime Channel Points

Twitch enforces the Channel Points cost; the bot listens for Channel Points redemption events directly.

Create a custom reward in the Twitch dashboard:

- Reward name: `Watchtime`
- Cost: `1000`
- Require viewer to enter text: disabled

If `channelPoints.watchtimeRewardId` is empty, the bot matches the reward by the exact title `Watchtime`. Setting the reward ID is stricter.

Create a second custom reward for song requests:

- Reward name: `Song Request`
- Cost: `500`
- Require viewer to enter text: enabled
- Viewer input: song name, artist, or Spotify link

Normal chat `!sr` and `!songrequest` are blocked. Song requests are added from the redemption input only. If `channelPoints.songRequestRewardId` is empty, the bot matches the reward by the exact title `Song Request`.

Create SHD token pack rewards:

- Reward name: `Small SHD Token Pack`
- Cost: `500`
- Text input: disabled
- Gives: `50 SHD tokens`

- Reward name: `SHD Token Pack`
- Cost: `1500`
- Text input: disabled
- Gives: `200 SHD tokens`

- Reward name: `Big SHD Token Pack`
- Cost: `2500`
- Text input: disabled
- Gives: `400 SHD tokens`

These packs are configured under `channelPoints.tokenPacks` in `data/config.json`. If a pack `rewardId` is empty, the bot matches by exact reward title.

Direct Channel Points redemption handling requires a broadcaster token:

```bash
npm run twitch:broadcaster-auth-url
npm run twitch:broadcaster-token -- pasted_code_here
npm run twitch:broadcaster-check
```

Add the printed `TWITCH_BROADCASTER_ACCESS_TOKEN` and `TWITCH_BROADCASTER_REFRESH_TOKEN` values to `.env`.

## Timers

Timers are globally enabled in `data/config.json`:

```json
"timersEnabled": true
```

Then enable individual timers in `data/timers.json`. A timer only sends after its interval has passed and enough chat messages have happened, which keeps it from spamming a quiet chat.

## Filters

Basic filters live in `data/config.json` under `filters`.

- `linkFilter` notices links unless the domain is allowed.
- `capsFilter` catches long high-caps messages.
- `repeatFilter` catches repeated message spam.

Normal filter hits log what they noticed but do not timeout, ban, delete, or block the chat message. Messages that match `scamPatterns` are the only automatic bans.

## Local Testing

You can test command behavior without Twitch credentials:

```bash
npm run simulate -- "!ping"
npm run simulate -- "!8ball is this alive"
npm run simulate -- "!sr some song"
```

The simulator uses a fake Twitch API and prints bot replies to the terminal.

Run the smoke test:

```bash
npm test
```

## Spotify

Fill these in `.env`:

```env
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REFRESH_TOKEN=
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/callback
```

To get a refresh token:

```bash
npm run spotify:auth-url
```

Open the printed URL, approve the app, copy the `code` from the redirect URL, then run:

```bash
npm run spotify:token -- pasted_code_here
```

Then put the printed `SPOTIFY_REFRESH_TOKEN` into `.env`.

When Spotify is configured:

- `!song` reads the current Spotify track.
- The Song Request Channel Points reward searches Spotify and adds the track to the active queue.
- `!skip` asks Spotify to skip to the next track.
- `!devices` lists Spotify devices.
- `!setdevice <number>` chooses which Spotify device receives queued songs.

Song request safety lives in `data/songQueue.json`:

- `approvalRequired` sends requests to `!queue pending` until staff use `!approve`.
- `maxDurationMs` blocks long songs.
- `allowExplicit` controls explicit tracks.
- `blockedTerms` blocks request text.
- `blockedArtists` blocks artists.

## Command Page

Generate the local command list page:

```bash
npm run export:commands
```

This writes `public/commands.json` and `public/commands.html`. Set `commandsUrl` in `data/config.json` to wherever you host that page later.

## Twitch Token Helper

To generate a Twitch auth URL:

```bash
npm run twitch:auth-url
```

After approving the app, copy the `code` from the redirect URL and run:

```bash
npm run twitch:token -- pasted_code_here
```

Then copy the printed tokens into `.env`.

To verify the current Twitch token owner, scopes, and expiry without printing secrets:

```bash
npm run twitch:check
```

After that first authorization, you should not need to regenerate tokens every day. Keep both of these in `.env` or your VPS secret store:

```env
TWITCH_ACCESS_TOKEN=
TWITCH_REFRESH_TOKEN=
```

If the bot can write to `.env`, it persists refreshed Twitch tokens there. If your VPS injects secrets without a writable `.env`, the bot still refreshes in memory, but you should restart it only after updating the stored refresh token if Twitch rotates it.

## VPS Hardening

- Keep `.env` private and never commit access tokens, refresh tokens, or client secrets.
- Run the bot under a process manager such as `pm2` or `systemd` so it restarts after crashes or VPS reboots.
- Leave moderation scopes out unless you intentionally re-add moderation features.
- `outboundChatIntervalMs` limits bot replies to a steady pace; the default is `1200`, which is conservative for a non-mod bot.
- `maxOutboundChatQueue` caps queued replies during spammy moments; the default is `25`.

## Integration Notes

YouTube song requests, Discord logs, OBS WebSocket, VPS deployment, and a web dashboard are intentionally left out for now.

OBS commands currently update local state in `data/streamState.json`. They are intentionally shaped like real stream commands, so connecting OBS WebSocket later should not require changing chat commands.

Event reactions are configurable. Twitch will reject optional EventSub subscriptions if the token does not have the matching scope, and the bot keeps running.

Watchtime and Song Request Channel Points rewards are handled directly when broadcaster tokens are configured. Other Channel Point redemption reactions are still scaffolded behind `eventSub.channelPointRedemption` and `events.channelPointRedemption`.

## Current Build Plan

Version 1 should stay small: chat connection, JSON commands, cooldowns, permissions, points, timers, giveaways, and song requests. Moderation actions are intentionally disabled.
