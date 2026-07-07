import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CommandRouter } from "../src/commands.js";
import { readJson, writeJson } from "../src/storage.js";

const dataDir = path.resolve("data");
const backup = new Map();
for (const file of await readdir(dataDir)) {
  if (file.endsWith(".json")) backup.set(file, await readFile(path.join(dataDir, file), "utf8"));
}

const replies = [];
const config = {
  ...(await readJson("config.json")),
  owners: ["tester"],
  admins: [],
  moderators: ["mod"],
  twitch: { channelName: "local", channelId: "1", botUsername: "shd_bot", botUserId: "2" },
  spotify: {}
};

class MockTwitchApi {
  async sendMessage(message) { replies.push(message); }
  async getStream() { return { started_at: new Date(Date.now() - 60000).toISOString() }; }
  async timeout() { return true; }
  async ban() { return true; }
  async unban() { return true; }
}

const router = new CommandRouter(config, new MockTwitchApi(), null, null);

try {
  const users = await readJson("users.json");
  users.viewer = {
    firstSeenAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    messageCount: 1,
    seenDates: [],
    firstMessageSent: false,
    watchtimeMs: 65 * 60 * 1000
  };
  await writeJson("users.json", users);

  await run("!ping");
  await run("!commands");
  await run("!watchtime viewer");
  await run("!sr test song");
  await router.handleWatchtimeRedemption({
    id: null,
    text: "",
    username: "viewer",
    displayName: "viewer",
    userId: "101",
    badges: []
  });
  await router.handleSongRequest("test song", {
    id: null,
    text: "",
    username: "tester",
    displayName: "tester",
    userId: "100",
    badges: []
  });
  await router.handleTokenPackRedemption({ amount: 50 }, {
    id: null,
    text: "",
    username: "viewer",
    displayName: "viewer",
    userId: "101",
    badges: []
  });
  await run("!topup");
  await run("!giveaway start join Prize");
  await run("!giveaway open");
  await runAs("!setpoints viewer 10", "mod", [{ set_id: "moderator" }]);
  await runAs("!setpoints viewer 10", "channelowner", [{ set_id: "broadcaster" }]);

  assert(replies.includes("pong"), "ping reply missing");
  assert(replies.some((reply) => reply.includes("Command list:")), "commands URL reply missing");
  assert(replies.some((reply) => reply.includes("Redeem the Watchtime channel point reward")), "watchtime lock reply missing");
  assert(replies.some((reply) => reply.includes("@viewer watchtime: 1h 5m.")), "watchtime reward reply missing");
  assert(replies.some((reply) => reply.includes("Redeem the Song Request channel point reward")), "song request lock reply missing");
  assert(replies.some((reply) => reply.includes("Added song request")), "song request reward reply missing");
  assert(replies.some((reply) => reply.includes("@viewer bought 50 SHD tokens")), "token pack reply missing");
  assert(replies.some((reply) => reply.includes("Topped up")), "topup reply missing");
  assert(replies.some((reply) => reply.includes("Giveaway entries are open")), "giveaway open reply missing");
  assert(replies.some((reply) => reply.includes("Only the channel owner can set SHD tokens.")), "setpoints mod rejection missing");
  assert(replies.some((reply) => reply.includes("viewer now has 10 SHD tokens")), "setpoints owner success missing");

  console.log("smoke ok");
} finally {
  for (const [file, contents] of backup) await writeFile(path.join(dataDir, file), contents);
}

async function run(text) {
  await runAs(text, "tester", [{ set_id: "broadcaster" }]);
}

async function runAs(text, username, badges) {
  await router.handleChatMessage({
    id: `msg-${replies.length}`,
    text,
    username,
    displayName: username,
    userId: "100",
    badges
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
