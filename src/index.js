import { CommandRouter } from "./commands.js";
import { loadRuntimeConfig } from "./config.js";
import { EventSubChat } from "./eventsub.js";
import { ChatGuard } from "./filters.js";
import { getUserRole } from "./permissions.js";
import { TimerManager } from "./timers.js";
import { TwitchApi } from "./twitchApi.js";
import { UserTracker } from "./users.js";
import { readJson, writeJson } from "./storage.js";
import { SpotifyApi } from "./spotifyApi.js";
import { TwitchAuth } from "./twitchAuth.js";

async function main() {
  const config = await loadRuntimeConfig();
  const twitchAuth = new TwitchAuth(config);
  await twitchAuth.ensureValidToken();

  const twitchApi = new TwitchApi(config, twitchAuth);
  let broadcasterApi = null;
  if (config.twitch.broadcaster) {
    const broadcasterAuth = new TwitchAuth(config, {
      tokenProfile: config.twitch.broadcaster,
      envKeys: {
        accessToken: "TWITCH_BROADCASTER_ACCESS_TOKEN",
        refreshToken: "TWITCH_BROADCASTER_REFRESH_TOKEN"
      },
      label: "Twitch broadcaster"
    });
    await broadcasterAuth.ensureValidToken();
    broadcasterApi = new TwitchApi(config, broadcasterAuth);
  } else {
    console.warn("No broadcaster Twitch token configured; Channel Points reward redemptions will not be handled directly.");
  }

  const spotifyApi = new SpotifyApi(config);
  const guard = new ChatGuard(config, twitchApi);
  const router = new CommandRouter(config, twitchApi, guard, spotifyApi);
  const timers = new TimerManager(config, twitchApi);
  const users = new UserTracker(config, twitchApi);

  timers.start();
  users.start();

  const chat = new EventSubChat(config, twitchApi, async (message) => {
    console.log(`#${config.twitch.channelName} ${message.username}: ${message.text}`);
    timers.recordChatMessage();

    try {
      const userRole = getUserRole(message, config);
      const isCommand = message.text.startsWith(config.prefix ?? "!");
      if (!isCommand && await guard.inspect(message, userRole)) return;

      await users.recordMessage(message);
      await router.handleChatMessage(message);
    } catch (error) {
      console.error(`Command failed for ${message.username}:`, error.message);
    }
  }, async (type, event) => {
    await handleEventSubNotification(config, twitchApi, router, type, event);
  });

  chat.connect();

  if (broadcasterApi) {
    const rewardEvents = new EventSubChat(config, broadcasterApi, null, async (type, event) => {
      await handleEventSubNotification(config, twitchApi, router, type, event);
    }, {
      chat: false,
      eventKeys: ["channelPointRedemption"]
    });
    rewardEvents.connect();
  }
}

async function handleEventSubNotification(config, twitchApi, router, type, event) {
  if (type === "channel.channel_points_custom_reward_redemption.add") {
    const handled = await handleChannelPointRedemption(config, router, event);
    if (handled) return;
  }

  const events = await readJson("events.json");
  const keyByType = {
    "channel.follow": "follow",
    "channel.subscribe": "sub",
    "channel.subscription.gift": "giftSub",
    "channel.raid": "raid",
    "channel.cheer": "cheer",
    "channel.channel_points_custom_reward_redemption.add": "channelPointRedemption"
  };
  const key = keyByType[type];
  const template = key ? events[key] : null;

  await awardEventToken(config, type, event);

  if (!template?.enabled) return;

  const message = template.message
    .replaceAll("{user}", event.user_login ?? event.user_name ?? event.from_broadcaster_user_login ?? "someone")
    .replaceAll("{viewers}", String(event.viewers ?? 0))
    .replaceAll("{amount}", String(event.total ?? event.cumulative_total ?? 1))
    .replaceAll("{bits}", String(event.bits ?? 0))
    .replaceAll("{reward}", event.reward?.title ?? "a reward");

  await twitchApi.sendMessage(message);
}

async function handleChannelPointRedemption(config, router, event) {
  const rewardTitle = event.reward?.title ?? "";
  const rewardId = event.reward?.id ?? "";
  const userLogin = event.user_login ?? event.user_name;
  const message = {
    id: null,
    username: userLogin,
    displayName: event.user_name ?? userLogin,
    userId: event.user_id,
    text: ""
  };

  if (matchesReward(config, event, "watchtimeRewardId", "watchtime")) {
    await router.handleWatchtimeRedemption(message);
    return true;
  }

  if (matchesReward(config, event, "songRequestRewardId", "song request")) {
    const query = (event.user_input ?? "").trim();
    await router.handleSongRequest(stripSongRequestCommand(query), message);
    return true;
  }

  const tokenPack = matchingTokenPack(config, event);
  if (tokenPack) {
    await router.handleTokenPackRedemption(tokenPack, message);
    return true;
  }

  console.log(`Unhandled Channel Points reward: ${rewardTitle || rewardId}`);
  return false;
}

function matchesReward(config, event, rewardIdKey, fallbackTitle) {
  const configuredRewardId = String(config.channelPoints?.[rewardIdKey] ?? "").trim();
  const rewardId = event.reward?.id ?? "";
  if (configuredRewardId) return rewardId === configuredRewardId;
  return String(event.reward?.title ?? "").trim().toLowerCase() === fallbackTitle;
}

function stripSongRequestCommand(input) {
  return input.replace(/^!(sr|songrequest)\s+/i, "").trim();
}

function matchingTokenPack(config, event) {
  const rewardId = event.reward?.id ?? "";
  const rewardTitle = String(event.reward?.title ?? "").trim().toLowerCase();
  return (config.channelPoints?.tokenPacks ?? []).find((pack) => {
    const configuredRewardId = String(pack.rewardId ?? "").trim();
    if (configuredRewardId) return configuredRewardId === rewardId;
    return String(pack.title ?? "").trim().toLowerCase() === rewardTitle;
  });
}

async function awardEventToken(config, type, event) {
  const rewardByType = {
    "channel.follow": config.followTokenReward ?? 1,
    "channel.subscribe": config.subTokenReward ?? 1,
    "channel.subscription.gift": config.giftSubTokenReward ?? 1
  };
  const amount = rewardByType[type] ?? 0;
  if (!amount) return;

  const points = await readJson("points.json");
  const recipients = tokenRewardRecipients(type, event);
  for (const username of recipients) {
    const key = username.toLowerCase();
    points[key] ??= { balance: 0, lastDailyAt: null };
    points[key].balance += amount;
    points[key].lastRewardAt = new Date().toISOString();
  }

  await writeJson("points.json", points);
}

function tokenRewardRecipients(type, event) {
  if (type === "channel.subscription.gift") {
    return uniqueLower([
      event.user_login,
      event.user_name,
      event.recipient_user_login,
      event.recipient_user_name
    ]);
  }

  return uniqueLower([event.user_login ?? event.user_name]);
}

function uniqueLower(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).toLowerCase()))];
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
