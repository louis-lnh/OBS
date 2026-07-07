# Twitch Chat Bot Concept

_Night idea draft — custom Twitch bot using a dedicated bot account._

## Goal

Build a custom Twitch chat bot that can send messages through a dedicated Twitch bot account, handle common stream commands, assist with moderation, run engagement features, and later connect to stream tools like OBS, Spotify/song requests, and Discord.

The bot should feel clean, useful, and personal — not overloaded with random spam features.

---

## 1. Account / General Idea

### Recommended Setup

Use a dedicated Twitch bot account instead of the main account or a private second account.

Example names:

- `luigi_helper`
- `luigi_bot`
- `shd_livebot`
- `stream_helper`

The bot account should be modded in the Twitch channel:

```txt
/mod bot_account_name
```

This allows the bot to perform moderation actions like timeout, ban, delete messages, and more, depending on API permissions.

---

## 2. Core Commands

These are the basic commands the bot should support first.

### General Info Commands

| Command | Purpose |
|---|---|
| `!discord` | Sends the Discord invite link. |
| `!sens` | Shows current Valorant sensitivity / DPI. |
| `!rank` | Shows current Valorant rank. |
| `!setup` | Shows PC / peripherals / stream setup. |
| `!song` | Shows current song if music integration is available. |
| `!uptime` | Shows how long the stream has been live. |
| `!rules` | Sends chat rules. |
| `!socials` | Sends social links. |
| `!team` | Shows current team / roster info. |
| `!crosshair` | Sends Valorant crosshair code. |
| `!server` | Shows server/community info if needed. |
| `!apply` | Sends application/support portal link if relevant. |
| `!tracker` | Sends tracker/profile link. |
| `!premier` | Shows Premier/team info. |
| `!schedule` | Shows stream or match schedule. |
| `!duo` | Shows duo queue partner or duo status. |

### Notes

- Commands should have cooldowns.
- Some commands should be mod-only or owner-only.
- Responses should be editable without touching the code later.
- First version can use a JSON config file, later a database or dashboard.

---

## 3. Auto Messages / Timers

The bot should be able to send automatic messages after a certain amount of time or after a certain number of chat messages.

Example timer messages:

- Discord reminder
- Socials reminder
- Chat rules reminder
- Support/apply reminder
- Setup/rank command hint
- “Use `!song` to see the current song”
- “Use `!crosshair` for my Valorant crosshair”

### Important

Timers should not be spammy.

Recommended behavior:

- Only send timer if chat has been active.
- Minimum delay between auto messages.
- Randomly rotate messages.
- Disable certain timers depending on stream category.

---

## 4. Custom Commands

The bot should allow creating and editing commands without redeploying.

### Commands

| Command | Purpose |
|---|---|
| `!addcom <command> <response>` | Adds a new command. |
| `!editcom <command> <response>` | Edits an existing command. |
| `!delcom <command>` | Deletes a command. |
| `!commands` | Lists available commands. |
| `!commandinfo <command>` | Shows info like cooldown, creator, usage count. |

### Permissions

Only trusted roles should be able to manage commands:

- Owner
- Mods
- Maybe VIPs later, if allowed

---

## 5. Moderation Features

The bot should include moderation tools and automatic filters.

### Manual Moderation Commands

| Command | Purpose |
|---|---|
| `!timeout <user> <duration> <reason>` | Times out a user. |
| `!ban <user> <reason>` | Bans a user. |
| `!unban <user>` | Unbans a user. |
| `!warn <user> <reason>` | Gives a warning. |
| `!warnings <user>` | Shows warnings for a user. |
| `!clearwarns <user>` | Clears warnings. |
| `!purge <user>` | Deletes recent messages from user if possible. |
| `!permit <user>` | Temporarily allows a user to post a link. |
| `!slow <seconds>` | Enables slow mode. |
| `!slowoff` | Disables slow mode. |
| `!followers` | Enables follower-only mode. |
| `!followersoff` | Disables follower-only mode. |
| `!subonly` | Enables sub-only mode. |
| `!subonlyoff` | Disables sub-only mode. |

### Automatic Moderation

Features to include:

- Link filter
- Allowed links / domain allowlist
- Scam link detection
- Caps filter
- Emote spam filter
- Symbol spam filter
- Repeated message filter
- Banned words
- First-time chatter check
- Excessive mention detection
- Basic bot/scam pattern detection

### Moderation Logging

Log moderation actions to:

- Console
- Local file
- Database later
- Optional Discord mod-log channel later

---

## 6. Giveaways / Raffles

The bot should support simple giveaways.

### Commands

| Command | Purpose |
|---|---|
| `!giveaway start <keyword>` | Starts a giveaway. |
| `!giveaway end` | Ends giveaway and picks winner. |
| `!giveaway reroll` | Rerolls winner. |
| `!join` | User joins active giveaway. |
| `!raffle start` | Starts a raffle. |
| `!raffle end` | Ends raffle. |

### Options Later

- Sub-only giveaway
- VIP-only giveaway
- Follower-only giveaway
- Keyword-based entry
- One entry per user
- Weighted entries for subs/VIPs

---

## 7. Points / Economy System

The bot should have its own point system, separate from Twitch Channel Points.

Inspired by bots where users collect bot-only coins and use them for commands/games.

### Point Sources

Possible ways to earn points:

- Watching the stream
- Active chatting
- Daily claim
- Stream streaks
- First message of the stream
- Being present during raids/events
- Manual top-up by owner/mod
- Giveaway rewards

### Economy Commands

| Command | Purpose |
|---|---|
| `!points` | Shows user’s points. |
| `!points <user>` | Shows another user’s points. |
| `!top` | Shows points leaderboard. |
| `!daily` | Claims daily points. |
| `!streak` | Shows watch/chat streak. |
| `!topup <user> <amount>` | Owner/mod adds points. |
| `!takepoints <user> <amount>` | Owner/mod removes points. |
| `!give <user> <amount>` | User gives points to another user. |
| `!gamble <amount>` | Gamble points. |
| `!dice <amount>` | Dice game. |
| `!coinflip <amount>` | Coinflip gamble. |
| `!slots <amount>` | Slot-style gamble. |

### Song Requests With Points

Potential feature:

- Users spend bot points to request songs.
- Bot checks if user has enough points.
- Song gets added to a queue.
- Mods/owner can skip, deny, or clear requests.

Commands:

| Command | Purpose |
|---|---|
| `!sr <song/link>` | Requests a song. |
| `!songrequest <song/link>` | Same as `!sr`. |
| `!queue` | Shows current queue. |
| `!skip` | Mod skips song. |
| `!deny <id>` | Denies song request. |
| `!clearsongs` | Clears queue. |
| `!volume <value>` | Optional music volume command. |

### Important Notes

- Need to decide later whether song requests use Spotify, YouTube, or another music source.
- Spotify playback control requires extra API setup and premium limitations may apply.
- YouTube/song request systems need moderation to avoid DMCA or troll requests.
- Song requests should probably be mod-approved or restricted at first.

---

## 8. Raid / Follow / Sub Reactions

The bot should send event messages in chat.

### Events

- New follower
- New subscriber
- Resub
- Gifted sub
- Raid
- Bits/cheer
- First-time chatter
- Returning chatter
- Channel Point redemption, if integrated later

### Example Messages

```txt
Welcome @user, thanks for the follow!
```

```txt
Huge thanks to @user for the sub!
```

```txt
@raider just raided with 12 viewers. Welcome in everyone!
```

```txt
First time chatter detected: @user. Welcome in!
```

### Notes

- Messages should be customizable.
- Some alerts can be disabled per stream.
- Avoid making the bot too spammy.

---

## 9. Viewer Engagement Commands

These are optional fun commands that can make chat more alive.

### Useful/Fun Commands

| Command | Purpose |
|---|---|
| `!lurk` | User says they are lurking. |
| `!unlurk` | User returns from lurking. |
| `!hug <user>` | Sends hug message. |
| `!bonk <user>` | Sends bonk message. |
| `!clutch` | Counts clutch moments. |
| `!death` | Counts deaths. |
| `!mald` | Counts mald moments. |
| `!throw` | Counts thrown rounds. |
| `!ace` | Counts aces. |
| `!win` | Counts wins. |
| `!loss` | Counts losses. |
| `!poll` | Starts simple poll. |
| `!vote` | Vote command for polls. |
| `!8ball` | Magic 8-ball style response. |
| `!rate <thing>` | Random rating command. |
| `!choose <a> or <b>` | Bot chooses between options. |

### Keep Out For Now

- Quote system

Reason: not needed for the first version.

---

## 10. Stream Tool Commands

These are commands that can help control or manage the stream.

### Basic Stream Commands

| Command | Purpose |
|---|---|
| `!uptime` | Shows stream uptime. |
| `!title` | Shows current stream title. |
| `!settitle <title>` | Changes stream title. |
| `!category` | Shows current category. |
| `!setcategory <category>` | Changes category. |
| `!marker <note>` | Adds stream marker / local timestamp note. |
| `!clip` | Attempts to create a clip or reminds users to clip. |
| `!recording` | Shows recording status if connected. |

### OBS / Local Tool Commands Later

| Command | Purpose |
|---|---|
| `!scene <name>` | Switches OBS scene. |
| `!brb` | Switches to BRB scene. |
| `!game` | Switches to gameplay scene. |
| `!cam` | Toggles camera. |
| `!handcam` | Toggles handcam. |
| `!replay` | Saves replay buffer. |
| `!mute` | Mutes a source. |
| `!unmute` | Unmutes a source. |
| `!panic` | Emergency command, e.g. BRB + mute + slowmode. |

### Permissions

Most stream tool commands should be:

- Owner-only
- Maybe trusted mod-only

---

## 11. Valorant / Gaming Commands

These are useful even when the stream is not SHD or Lifesteal related.

| Command | Purpose |
|---|---|
| `!rank` | Shows current Valorant rank. |
| `!sens` | Shows sensitivity. |
| `!dpi` | Shows DPI. |
| `!edpi` | Shows eDPI. |
| `!crosshair` | Shows crosshair code. |
| `!tracker` | Sends tracker link. |
| `!duo` | Shows duo queue partner/status. |
| `!premier` | Shows Premier info. |
| `!agent` | Shows current/favorite agent. |
| `!map` | Shows current map if manually set. |
| `!schedule` | Shows match/stream schedule. |

---

## 12. Permission System

The bot should support permission levels.

### Suggested Roles

1. Owner
2. Bot Admin
3. Moderator
4. VIP
5. Subscriber
6. Regular
7. Viewer

### Permission Use Cases

- Owner-only: bot shutdown, reload config, OBS commands, token-sensitive stuff
- Mod-only: timeout, ban, warn, giveaways, song skip
- VIP/Sub: maybe lower cooldowns or special commands
- Everyone: normal info commands and fun commands

---

## 13. Data Storage

### First Version

Use JSON files:

- `commands.json`
- `timers.json`
- `users.json`
- `points.json`
- `warnings.json`
- `config.json`

### Later Version

Use database:

- SQLite for simple local bot
- PostgreSQL if connected to VPS/dashboard

### Data To Track

- Command responses
- Command usage count
- User points
- Watchtime
- Streaks
- Warnings
- Giveaway entries
- Song queue
- Timer settings
- Event logs

---

## 14. Setup Flow

### Step 1 — Create Bot Account

Create a dedicated Twitch account for the bot.

### Step 2 — Mod Bot In Channel

In your Twitch chat:

```txt
/mod bot_account_name
```

### Step 3 — Create Twitch Developer Application

Create an app in the Twitch Developer Console.

Save:

```env
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
TWITCH_REDIRECT_URI=
```

### Step 4 — OAuth / Token Setup

The bot account needs to authorize the app.

Required scopes depend on implementation, but likely include chat read/write permissions.

Example env values:

```env
TWITCH_BOT_USERNAME=
TWITCH_BOT_USER_ID=
TWITCH_CHANNEL_NAME=
TWITCH_CHANNEL_ID=
TWITCH_ACCESS_TOKEN=
TWITCH_REFRESH_TOKEN=
```

### Step 5 — Connect Bot To Twitch Chat

First test:

```txt
!ping -> pong
```

Then add basic commands.

### Step 6 — Add Config System

Commands should be editable through config or chat commands.

### Step 7 — Add Moderation

Start with:

- `!timeout`
- `!ban`
- `!warn`
- link filter
- caps/spam filter

### Step 8 — Add Points

Start simple:

- points per watch time
- `!points`
- `!daily`
- `!top`
- `!gamble`

### Step 9 — Add Events

Add chat messages for:

- follow
- sub
- raid
- gift sub

### Step 10 — Deploy

Run locally first.

Later deploy to VPS with PM2:

```bash
pm2 start index.js --name twitch-bot
pm2 save
```

---

## 15. Suggested Build Order

### Version 1 — Basic Bot

- Twitch connection
- Dedicated bot account
- Basic commands
- Cooldowns
- JSON config
- PM2 deploy

### Version 2 — Useful Stream Bot

- Auto messages
- Custom commands
- Moderation commands
- Basic filters
- Event messages

### Version 3 — Engagement Bot

- Points
- Daily/streaks
- Gamble/dice/coinflip
- Giveaways
- Song request queue

### Version 4 — Stream Control

- OBS WebSocket
- Scene commands
- Marker commands
- Replay buffer commands
- Panic command

### Version 5 — Dashboard / Full System

- Web dashboard
- Database
- Discord logs
- Advanced permissions
- Multi-stream/category profiles

---

## 16. First MVP Command List

Good first commands to implement:

```txt
!ping
!discord
!sens
!rank
!setup
!song
!uptime
!rules
!socials
!team
!crosshair
!tracker
!duo
!schedule
!addcom
!editcom
!delcom
!commands
!timeout
!ban
!unban
!warn
!warnings
!permit
!points
!daily
!top
!gamble
!dice
!sr
!queue
!skip
!giveaway
!join
```

---

## 17. Notes For Later

- Keep SHD/Lifesteal-specific features separate from general stream bot features.
- Use category-based profiles later, e.g. Valorant mode, Minecraft mode, Chill mode.
- Make the bot useful first, funny second.
- Avoid spam.
- Keep commands editable without code changes.
- Build small, then slowly turn it into Luigi Control Center.
