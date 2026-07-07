import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const TWITCH_VALIDATE_URL = "https://id.twitch.tv/oauth2/validate";
const ENV_PATH = path.resolve(".env");

export class TwitchAuth {
  constructor(config, options = {}) {
    this.config = config;
    this.tokenProfile = options.tokenProfile ?? config.twitch;
    this.envKeys = options.envKeys ?? {
      accessToken: "TWITCH_ACCESS_TOKEN",
      refreshToken: "TWITCH_REFRESH_TOKEN"
    };
    this.label = options.label ?? "Twitch";
    this.refreshPromise = null;
  }

  async ensureValidToken() {
    try {
      const token = await this.validateToken();
      if (token.expires_in > 300) return;
      console.log("Twitch access token expires soon; refreshing.");
    } catch (error) {
      console.log(`Twitch access token validation failed; refreshing. ${error.message}`);
    }

    await this.refreshAccessToken();
  }

  async refreshAccessToken() {
    this.refreshPromise ??= this.doRefreshAccessToken().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  async validateToken() {
    const response = await fetch(TWITCH_VALIDATE_URL, {
      headers: {
        Authorization: `OAuth ${this.tokenProfile.accessToken}`
      }
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`validate returned ${response.status}: ${text}`);
    }

    return JSON.parse(text);
  }

  async doRefreshAccessToken() {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.tokenProfile.refreshToken,
      client_id: this.config.twitch.clientId,
      client_secret: this.config.twitch.clientSecret
    });

    const response = await fetch(TWITCH_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Twitch token refresh failed: ${response.status} ${text}`);
    }

    const data = JSON.parse(text);
    this.tokenProfile.accessToken = normalizeToken(data.access_token);
    this.tokenProfile.refreshToken = normalizeToken(data.refresh_token ?? this.tokenProfile.refreshToken);
    process.env[this.envKeys.accessToken] = this.tokenProfile.accessToken;
    process.env[this.envKeys.refreshToken] = this.tokenProfile.refreshToken;

    await persistEnvTokens({
      [this.envKeys.accessToken]: this.tokenProfile.accessToken,
      [this.envKeys.refreshToken]: this.tokenProfile.refreshToken
    });

    console.log(`Refreshed ${this.label} access token; expires in ${data.expires_in ?? "unknown"}s.`);
  }
}

async function persistEnvTokens(tokens) {
  let raw;
  try {
    raw = await readFile(ENV_PATH, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      console.warn("No .env file found; refreshed Twitch tokens are only stored in memory.");
      return;
    }
    throw error;
  }

  let next = raw;
  for (const [key, value] of Object.entries(tokens)) {
    const escaped = value.replaceAll("\\", "\\\\").replaceAll("\n", "");
    const pattern = new RegExp(`^${key}=.*$`, "m");
    if (pattern.test(next)) {
      next = next.replace(pattern, `${key}=${escaped}`);
    } else {
      next += `${next.endsWith("\n") ? "" : "\n"}${key}=${escaped}\n`;
    }
  }

  await writeFile(ENV_PATH, next);
}

function normalizeToken(token) {
  return String(token).replace(/^oauth:/i, "");
}
