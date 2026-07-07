import dotenv from "dotenv";

dotenv.config();

const [code] = process.argv.slice(2);
const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const redirectUri = process.env.SPOTIFY_REDIRECT_URI ?? "http://127.0.0.1:3000/callback";

if (!clientId || !clientSecret || !code) {
  console.error("Usage: npm run spotify:token -- <code>");
  console.error("Requires SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.");
  process.exit(1);
}

const response = await fetch("https://accounts.spotify.com/api/token", {
  method: "POST",
  headers: {
    Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    "Content-Type": "application/x-www-form-urlencoded"
  },
  body: new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri
  })
});

const data = await response.json();
if (!response.ok) {
  console.error(data);
  process.exit(1);
}

console.log("Add this to .env:");
console.log(`SPOTIFY_REFRESH_TOKEN=${data.refresh_token}`);
