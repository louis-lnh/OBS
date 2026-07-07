import { loadRuntimeConfig } from "../src/config.js";
import { TwitchAuth } from "../src/twitchAuth.js";

const config = await loadRuntimeConfig();
const broadcasterMode = process.argv.includes("--broadcaster");
const tokenProfile = broadcasterMode ? config.twitch.broadcaster : config.twitch;

if (!tokenProfile) {
  console.error("No broadcaster token configured. Add TWITCH_BROADCASTER_ACCESS_TOKEN and TWITCH_BROADCASTER_REFRESH_TOKEN.");
  process.exit(1);
}

const auth = new TwitchAuth(config, broadcasterMode ? {
  tokenProfile,
  envKeys: {
    accessToken: "TWITCH_BROADCASTER_ACCESS_TOKEN",
    refreshToken: "TWITCH_BROADCASTER_REFRESH_TOKEN"
  },
  label: "Twitch broadcaster"
} : {});

await auth.ensureValidToken();
const token = await auth.validateToken();

console.log(JSON.stringify({
  mode: broadcasterMode ? "broadcaster" : "bot",
  login: token.login,
  user_id: token.user_id,
  client_id: token.client_id,
  scopes: token.scopes,
  expires_in: token.expires_in,
  bot_username_matches: broadcasterMode ? null : token.login?.toLowerCase() === config.twitch.botUsername,
  bot_user_id_matches: broadcasterMode ? null : token.user_id === config.twitch.botUserId,
  broadcaster_channel_matches: broadcasterMode ? token.user_id === config.twitch.channelId : null,
  has_redemption_scope: broadcasterMode ? token.scopes?.includes("channel:read:redemptions") : null,
  client_id_matches: token.client_id === config.twitch.clientId
}, null, 2));
