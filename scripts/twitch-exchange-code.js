import dotenv from "dotenv";

dotenv.config();

const args = process.argv.slice(2);
const broadcasterMode = args.includes("--broadcaster");
const code = args.find((arg) => !arg.startsWith("--"));
const clientId = process.env.TWITCH_CLIENT_ID;
const clientSecret = process.env.TWITCH_CLIENT_SECRET;
const redirectUri = process.env.TWITCH_REDIRECT_URI ?? "https://localhost:3000/callback";

if (!clientId || !clientSecret || !code) {
  console.error("Usage: npm run twitch:token -- [--broadcaster] <code>");
  console.error("Requires TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET.");
  process.exit(1);
}

const response = await fetch("https://id.twitch.tv/oauth2/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri
  })
});

const data = await response.json();
if (!response.ok) {
  console.error(data);
  process.exit(1);
}

console.log("Add these to .env:");
console.log(`${broadcasterMode ? "TWITCH_BROADCASTER_ACCESS_TOKEN" : "TWITCH_ACCESS_TOKEN"}=${data.access_token}`);
console.log(`${broadcasterMode ? "TWITCH_BROADCASTER_REFRESH_TOKEN" : "TWITCH_REFRESH_TOKEN"}=${data.refresh_token}`);
