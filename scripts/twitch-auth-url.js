import dotenv from "dotenv";

dotenv.config();

const clientId = process.env.TWITCH_CLIENT_ID;
const redirectUri = process.env.TWITCH_REDIRECT_URI ?? "https://localhost:3000/callback";
const broadcasterMode = process.argv.includes("--broadcaster");

if (!clientId) {
  console.error("Set TWITCH_CLIENT_ID first.");
  process.exit(1);
}

const botScopes = [
  "user:read:chat",
  "user:write:chat",
  "user:bot",
  "moderator:manage:banned_users",
  "moderator:read:chatters",
  "moderator:read:followers",
  "channel:read:subscriptions"
];

const broadcasterScopes = [
  "channel:read:redemptions"
];

const params = new URLSearchParams({
  response_type: "code",
  client_id: clientId,
  redirect_uri: redirectUri,
  scope: (broadcasterMode ? broadcasterScopes : botScopes).join(" ")
});

console.log(`https://id.twitch.tv/oauth2/authorize?${params.toString()}`);
