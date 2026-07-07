import dotenv from "dotenv";

dotenv.config();

const clientId = process.env.SPOTIFY_CLIENT_ID;
const redirectUri = process.env.SPOTIFY_REDIRECT_URI ?? "http://127.0.0.1:3000/callback";

if (!clientId) {
  console.error("Set SPOTIFY_CLIENT_ID first.");
  process.exit(1);
}

const scopes = [
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-modify-playback-state"
];

const params = new URLSearchParams({
  response_type: "code",
  client_id: clientId,
  scope: scopes.join(" "),
  redirect_uri: redirectUri
});

console.log(`https://accounts.spotify.com/authorize?${params.toString()}`);
