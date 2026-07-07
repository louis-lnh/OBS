# Valorant Rank Automation Plan

## Goal

Update the overlay Valorant card without needing a Riot API key.

The current idea is to reuse the existing Twitch VALrr Bot command response:

```text
!rank
```

VALrr Bot already has access to the Valorant rank data and replies in Twitch chat with current rank, RR, and session stats. Our bot can request that data, listen for the reply, parse it, cache it, and expose it to the overlay.

## Proposed Flow

```text
Stream Deck button
  -> Windows shortcut / .bat / local API call
  -> SHD Twitch bot sends "!rank"
  -> VALrr Bot replies in Twitch chat
  -> SHD Twitch bot detects the VALrr Bot reply
  -> Bot parses rank, RR, and session W/D/L
  -> Bot writes data to local cache
  -> Overlay suite polls/receives updated cache
  -> Valorant info card updates
```

## Why This Works

This avoids needing direct Riot API access for the first version.

VALrr Bot becomes the data source, Twitch chat becomes the transport, and our local bot only acts as a controlled parser/cache layer. It is not as clean as an official API, but it is good enough for stream overlay automation.

## Expected Cached Data Shape

Possible cache file:

```text
data/overlay.json
```

Possible Valorant section:

```json
{
  "valorant": {
    "rank": "Ascendant 1",
    "rankIcon": "ascendat 1.png",
    "rr": "33 RR",
    "peak": "Ascendant 1",
    "session": {
      "wins": 2,
      "draws": 0,
      "losses": 1
    },
    "source": "VALrr Bot",
    "updatedAt": "2026-07-07T00:00:00.000Z"
  }
}
```

## Trigger Options

Stream Deck can trigger this in a few ways:

```text
1. Run a .bat file
2. Call a local HTTP endpoint
3. Send a local websocket/message later
```

Best first version:

```text
http://127.0.0.1:5174/api/overlay/valorant/refresh
```

The overlay/helper server or the Twitch bot can expose that endpoint. Long term, the Twitch bot should own it because the bot is the one sending chat messages and listening for replies.

## Bot Behavior

When refresh is triggered:

```text
1. Set a pending Valorant rank request state.
2. Send "!rank" to Twitch chat.
3. Start a short timeout window, for example 10-15 seconds.
4. Watch messages from the VALrr Bot username.
5. Parse the first matching rank response.
6. Save the parsed data.
7. Clear pending state.
```

If no valid reply arrives:

```text
Keep the previous cached rank data.
Write a failed refresh timestamp/reason for debugging.
```

## Parser Notes

The parser should be strict enough to avoid random chat messages, but flexible enough if VALrr Bot changes wording slightly.

We should first capture a few real VALrr Bot responses before finalizing regex patterns.

Likely fields:

```text
current rank
current RR
session wins
session draws
session losses
```

Potential normalized rank names need mapping to the existing rank PNG filenames:

```text
Ascendant 1 -> ascendat 1.png
Immortal 3 -> immortal 3.png
Radiant -> radiant.png
```

Note: the current rank asset folder uses `ascendat` in filenames, so the code should map `Ascendant` to `ascendat` unless the assets are renamed later.

## Overlay Behavior

The overlay should not parse Twitch chat directly.

It should read a clean state endpoint or file:

```text
/api/overlay/state
```

Then the Valorant card renders from normalized cached data. This keeps the visual layer simple and avoids coupling the React app to Twitch bot parsing details.

## Risks

VALrr Bot response format may change.

Twitch chat delivery can be delayed.

The bot may miss the reply if disconnected.

Calling `!rank` too often could spam chat or hit VALrr Bot cooldowns.

The first implementation should include a cooldown, for example one refresh every 60-120 seconds.

## First Implementation Steps

1. Save a few real VALrr Bot `!rank` replies.
2. Add a parser test script with those example replies.
3. Add a bot command/helper to send `!rank`.
4. Add pending request state and VALrr Bot reply detection.
5. Write parsed data into `data/overlay.json`.
6. Add `/api/overlay/state` to the overlay server or bot server.
7. Make the Valorant card read from that state instead of static `overlayConfig.ts`.

