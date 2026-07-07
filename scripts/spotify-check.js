import dotenv from "dotenv";
import { SpotifyApi } from "../src/spotifyApi.js";

dotenv.config();

const spotify = new SpotifyApi({
  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    refreshToken: process.env.SPOTIFY_REFRESH_TOKEN
  }
});

if (!spotify.enabled) {
  console.error("Spotify env values are incomplete.");
  process.exit(1);
}

try {
  const devices = await spotify.getDevices();
  const current = await spotify.getCurrentlyPlaying();

  console.log(`Spotify auth: ok`);
  console.log(`Devices: ${devices.length ? devices.map((device) => `${device.name}${device.is_active ? " (active)" : ""}`).join(", ") : "none"}`);
  console.log(`Current: ${current ?? "nothing playing"}`);
} catch (error) {
  console.error(error.message);
  if (error.message.includes("403")) {
    console.error("Spotify rejected the account. In the Spotify Developer Dashboard, add this Spotify account under the app's Users and Access section, then authorize again.");
  }
  process.exit(1);
}
