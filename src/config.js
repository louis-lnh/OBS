import dotenv from "dotenv";
import { readJson } from "./storage.js";

dotenv.config();

export async function loadRuntimeConfig() {
  const config = await readJson("config.json");
  const envOwners = splitCsv(process.env.BOT_OWNERS);

  return {
    ...config,
    owners: uniqueLower([...(config.owners ?? []), ...envOwners]),
    admins: uniqueLower(config.admins ?? []),
    moderators: uniqueLower(config.moderators ?? []),
    twitch: {
      clientId: requiredEnv("TWITCH_CLIENT_ID"),
      clientSecret: requiredEnv("TWITCH_CLIENT_SECRET"),
      accessToken: normalizeToken(requiredEnv("TWITCH_ACCESS_TOKEN")),
      refreshToken: normalizeToken(requiredEnv("TWITCH_REFRESH_TOKEN")),
      broadcaster: optionalTokenPair("TWITCH_BROADCASTER_ACCESS_TOKEN", "TWITCH_BROADCASTER_REFRESH_TOKEN"),
      botUsername: requiredEnv("TWITCH_BOT_USERNAME").toLowerCase(),
      botUserId: requiredEnv("TWITCH_BOT_USER_ID"),
      channelName: requiredEnv("TWITCH_CHANNEL_NAME").toLowerCase(),
      channelId: requiredEnv("TWITCH_CHANNEL_ID")
    },
    spotify: {
      clientId: process.env.SPOTIFY_CLIENT_ID ?? "",
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET ?? "",
      refreshToken: process.env.SPOTIFY_REFRESH_TOKEN ?? ""
    },
    overlayControl: {
      url: process.env.OVERLAY_CONTROL_URL ?? "http://127.0.0.1:5174"
    }
  };
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function normalizeToken(token) {
  return token.replace(/^oauth:/i, "");
}

function optionalTokenPair(accessName, refreshName) {
  const accessToken = process.env[accessName];
  const refreshToken = process.env[refreshName];
  if (!accessToken || !refreshToken) return null;
  return {
    accessToken: normalizeToken(accessToken),
    refreshToken: normalizeToken(refreshToken)
  };
}

function splitCsv(value = "") {
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function uniqueLower(values) {
  return [...new Set(values.map((value) => String(value).toLowerCase()))];
}
