import { CommandRouter } from "../src/commands.js";
import { readJson } from "../src/storage.js";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const input = process.argv.slice(2).join(" ");
if (!input) {
  console.log("Usage: npm run simulate -- \"!ping\"");
  process.exit(1);
}

const dataDir = path.resolve("data");
const dataBackup = new Map();
for (const file of await readdir(dataDir)) {
  if (file.endsWith(".json")) {
    dataBackup.set(file, await readFile(path.join(dataDir, file), "utf8"));
  }
}

const config = {
  ...(await readJson("config.json")),
  owners: ["tester"],
  admins: [],
  moderators: ["mod"],
  twitch: {
    channelName: "local",
    channelId: "1",
    botUsername: "shd_bot",
    botUserId: "2",
    clientId: "local",
    accessToken: "local"
  }
};

class MockTwitchApi {
  async sendMessage(message) {
    console.log(`BOT: ${message}`);
  }

  async getStream() {
    return { started_at: new Date(Date.now() - 42 * 60 * 1000).toISOString() };
  }

  async getChannel() {
    return { title: "Local test stream", game_name: "VALORANT" };
  }

  async updateChannel() {
    return { ok: true };
  }

  async createMarker() {}

  async createClip() {
    return { edit_url: "https://clips.twitch.tv/example" };
  }

  async timeout(login, seconds, reason) {
    console.log(`TIMEOUT: ${login} for ${seconds}s (${reason})`);
    return true;
  }

  async ban(login, reason) {
    console.log(`BAN: ${login} (${reason})`);
    return true;
  }

  async unban(login) {
    console.log(`UNBAN: ${login}`);
    return true;
  }
}

const router = new CommandRouter(config, new MockTwitchApi(), null);

try {
  await router.handleChatMessage({
    id: "local-message",
    text: input,
    username: "tester",
    displayName: "Tester",
    userId: "100",
    badges: [{ set_id: "broadcaster" }]
  });
} finally {
  for (const [file, contents] of dataBackup) {
    await writeFile(path.join(dataDir, file), contents);
  }
}
