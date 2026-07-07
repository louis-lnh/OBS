import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const commands = JSON.parse(await readFile("data/commands.json", "utf8"));
const staticCommands = [
  "ping", "commands", "command", "commandinfo", "points", "watchtime", "topup", "top", "setpoints", "gamble", "dice", "coinflip", "slots",
  "ban", "unban", "timeout",
  "sr", "song", "queue", "approve", "deny", "skip", "clearsongs", "devices", "setdevice",
  "giveaway", "join", "lurk", "unlurk", "hug", "bonk", "poll", "vote", "8ball", "rate",
  "choose", "reload", "shutdown"
];

const list = [
  ...Object.entries(commands).map(([name, command]) => ({
    command: `!${name}`,
    permission: command.permission ?? "viewer",
    cooldownSeconds: command.cooldownSeconds ?? null,
    description: command.response
  })),
  ...staticCommands.map((name) => ({
    command: `!${name}`,
    permission: builtInPermission(name),
    cooldownSeconds: null,
    description: builtInDescription(name)
  }))
].sort((a, b) => a.command.localeCompare(b.command));

await mkdir("public", { recursive: true });
await writeFile(path.join("public", "commands.json"), `${JSON.stringify(list, null, 2)}\n`);
await writeFile(path.join("public", "commands.html"), renderHtml(list));

console.log("Wrote public/commands.json and public/commands.html");

function builtInDescription(name) {
  const descriptions = {
    ping: "Checks whether the bot is alive.",
    commands: "Sends the command list URL.",
    command: "Sends the command list URL.",
    commandinfo: "Sends the command list URL.",
    points: "Shows SHD token balance.",
    watchtime: "Explains the Watchtime channel point reward.",
    topup: "Gives 1 SHD token when your balance is 0.",
    top: "Shows the SHD token leaderboard.",
    setpoints: "Channel owner sets an exact SHD token balance.",
    gamble: "Gambles SHD tokens.",
    dice: "Dice gamble.",
    coinflip: "Coinflip gamble.",
    slots: "Slots gamble.",
    ban: "Staff bans a user.",
    unban: "Staff unbans a user.",
    timeout: "Staff times out a user.",
    sr: "Explains the Song Request channel point reward.",
    song: "Shows the current Spotify song.",
    queue: "Shows upcoming requested songs.",
    approve: "Staff approval for pending song requests.",
    deny: "Staff denial for song requests.",
    skip: "Staff skip for current song.",
    clearsongs: "Staff clears song requests.",
    devices: "Staff lists Spotify playback devices.",
    setdevice: "Staff chooses a Spotify playback device.",
    giveaway: "Staff giveaway controls.",
    join: "Joins an open giveaway.",
    poll: "Staff poll controls.",
    vote: "Votes in an active poll."
  };
  if (name === "reload" || name === "shutdown") return "Owner-only bot control.";
  return descriptions[name] ?? "Bot command.";
}

function builtInPermission(name) {
  if (["setpoints", "reload", "shutdown"].includes(name)) return "owner";
  if ([
    "ban", "unban", "timeout", "approve", "deny", "skip", "clearsongs",
    "devices", "setdevice", "giveaway", "poll"
  ].includes(name)) return "moderator";
  return "viewer";
}

function renderHtml(commands) {
  const rows = commands.map((item) => `
      <tr>
        <td>${escapeHtml(item.command)}</td>
        <td>${escapeHtml(item.permission)}</td>
        <td>${item.cooldownSeconds ?? ""}</td>
        <td>${escapeHtml(item.description)}</td>
      </tr>`).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SHD Bot Commands</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 32px; background: #101214; color: #f4f4f4; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border-bottom: 1px solid #30343a; padding: 10px; text-align: left; vertical-align: top; }
    th { color: #9ed0ff; }
    code, td:first-child { font-family: Consolas, monospace; }
  </style>
</head>
<body>
  <h1>SHD Bot Commands</h1>
  <table>
    <thead><tr><th>Command</th><th>Permission</th><th>Cooldown</th><th>Description</th></tr></thead>
    <tbody>${rows}
    </tbody>
  </table>
</body>
</html>
`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}
