import { isCoolingDown } from "./cooldowns.js";
import { getUserRole, hasPermission } from "./permissions.js";
import { readJson, writeJson } from "./storage.js";
import { clamp, cleanUsername, formatDuration, parseAmount, parseDuration, pickRandom } from "./utils.js";
import { logAction } from "./logger.js";
import { overlayRequest, parseOverlayBoolean, parseOverlayInteger } from "./overlayControl.js";

export class CommandRouter {
  constructor(config, twitchApi, guard, spotifyApi) {
    this.config = config;
    this.twitchApi = twitchApi;
    this.guard = guard;
    this.spotifyApi = spotifyApi;
  }

  async handleChatMessage(message) {
    const prefix = this.config.prefix ?? "!";
    if (!message.text.startsWith(prefix)) return;

    const [rawName, ...args] = message.text.slice(prefix.length).trim().split(/\s+/);
    const name = rawName?.toLowerCase();
    if (!name) return;

    const userRole = getUserRole(message, this.config);
    const cooldownKey = `${message.username}:${name}`;
    const defaultCooldown = userRole === "owner"
      ? this.config.ownerCooldownSeconds
      : this.config.defaultCooldownSeconds;

    const staticCommands = await readJson("commands.json");
    const command = staticCommands[name];
    const cooldownRemaining = isCoolingDown(cooldownKey, command?.cooldownSeconds ?? defaultCooldown);
    if (cooldownRemaining > 0 && userRole !== "owner") return;

    if (command) {
      if (!hasPermission(userRole, command.permission)) {
        return this.reply(message, "You do not have permission to use that command.");
      }

      command.usageCount = (command.usageCount ?? 0) + 1;
      await writeJson("commands.json", staticCommands);
      return this.reply(message, fillTemplate(command.response, message, args));
    }

    return this.handleBuiltIn(name, args, message, userRole);
  }

  async handleBuiltIn(name, args, message, userRole) {
    if (name === "ping") {
      return this.reply(message, "pong");
    }

    if (name === "uptime") {
      const stream = await this.twitchApi.getStream();
      if (!stream) return this.reply(message, "The stream is currently offline.");
      return this.reply(message, `Stream uptime: ${formatDuration(Date.now() - Date.parse(stream.started_at))}`);
    }

    if (["addcom", "editcom", "delcom", "commandinfo", "command"].includes(name)) {
      return this.manageCommand(name, args, message, userRole);
    }

    if (name === "commands") {
      return this.reply(message, `Command list: ${this.config.commandsUrl}`);
    }

    if (["points", "daily", "top", "streak", "watchtime", "topup", "takepoints", "setpoints", "give", "gamble", "dice", "coinflip", "slots"].includes(name)) {
      return this.handlePoints(name, args, message, userRole);
    }

    if (["ban", "unban", "timeout"].includes(name)) {
      return this.handleModeration(name, args, message, userRole);
    }

    if (["giveaway", "join"].includes(name)) {
      return this.handleGiveaway(name, args, message, userRole);
    }

    if (["raffle"].includes(name)) {
      return this.handleGiveaway("giveaway", args, message, userRole);
    }

    if (["sr", "songrequest", "queue", "skip", "deny", "clearsongs", "volume", "song", "approve", "devices", "setdevice"].includes(name)) {
      return this.handleSongs(name, args, message, userRole);
    }

    if (["lurk", "unlurk", "hug", "bonk", "clutch", "death", "mald", "throw", "ace", "win", "loss", "poll", "vote", "8ball", "rate", "choose"].includes(name)) {
      return this.handleEngagement(name, args, message, userRole);
    }

    if (["title", "settitle", "category", "setcategory", "marker", "clip", "recording", "scene", "brb", "game", "cam", "handcam", "replay", "mute", "unmute", "panic", "setmap", "map", "setagent", "agent", "setduo", "overlay"].includes(name)) {
      return this.handleStreamTools(name, args, message, userRole);
    }

    if (["reload", "shutdown"].includes(name)) {
      return this.handleOwner(name, args, message, userRole);
    }

    const giveaway = await readJson("giveaway.json");
    if (giveaway.active && name === giveaway.keyword) {
      return this.handleGiveaway("join", args, message, userRole);
    }
  }

  async manageCommand(action, args, message, userRole) {
    if (action === "command" || action === "commandinfo") {
      return this.reply(message, `Command list: ${this.config.commandsUrl}`);
    }

    if (!hasPermission(userRole, "moderator")) {
      return this.reply(message, "Only mods can manage commands.");
    }

    const commandName = args.shift()?.replace(/^!/, "").toLowerCase();
    if (!commandName) return this.reply(message, `Usage: !${action} <command> <response>`);

    const commands = await readJson("commands.json");

    if (action === "delcom") {
      delete commands[commandName];
      await writeJson("commands.json", commands);
      return this.reply(message, `Deleted !${commandName}.`);
    }

    const response = args.join(" ").trim();
    if (!response) return this.reply(message, `Usage: !${action} <command> <response>`);

    commands[commandName] = {
      response,
      permission: commands[commandName]?.permission ?? "viewer",
      cooldownSeconds: commands[commandName]?.cooldownSeconds ?? this.config.defaultCooldownSeconds,
      usageCount: commands[commandName]?.usageCount ?? 0,
      editedBy: message.username,
      editedAt: new Date().toISOString()
    };

    await writeJson("commands.json", commands);
    return this.reply(message, `${action === "addcom" ? "Added" : "Updated"} !${commandName}.`);
  }

  async handlePoints(name, args, message, userRole) {
    const points = await readJson("points.json");
    const user = ensureUser(points, message.username);

    if (name === "points") {
      const target = cleanUsername(args[0] ?? "");
      const targetUser = target ? ensureUser(points, target) : user;
      const displayName = target ? `@${target}` : `@${message.username}`;
      return this.reply(message, `${displayName} you have ${targetUser.balance} ${this.config.currencyName}.`);
    }

    if (name === "daily") {
      if ((this.config.dailyAmount ?? 0) <= 0) return this.reply(message, "Daily SHD tokens are disabled right now.");
      const now = Date.now();
      if (user.lastDailyAt && now - Date.parse(user.lastDailyAt) < 24 * 60 * 60 * 1000) {
        return this.reply(message, "You already claimed your daily points. Try again later.");
      }

      user.balance += this.config.dailyAmount;
      user.lastDailyAt = new Date().toISOString();
      await writeJson("points.json", points);
      return this.reply(message, `Daily claimed: +${this.config.dailyAmount} ${this.config.currencyName}. Balance: ${user.balance}.`);
    }

    if (name === "top") {
      const top = Object.entries(points)
        .sort(([, a], [, b]) => b.balance - a.balance)
        .slice(0, 5)
        .map(([username, data], index) => `${index + 1}. ${username}: ${data.balance}`)
        .join(" | ");
      return this.reply(message, top || "No points yet.");
    }

    if (name === "streak") {
      const streak = user.streakDays ?? 0;
      return this.reply(message, `${message.username}'s streak: ${streak} day(s).`);
    }

    if (name === "watchtime") {
      return this.reply(message, `Redeem the Watchtime channel point reward (${this.config.channelPoints?.watchtimeCost ?? 1000} points). No chat command needed.`);
    }

    if (name === "topup" || name === "takepoints") {
      if (name === "topup" && !args.length) {
        if (user.balance > 0) return this.reply(message, `Topup is only available when you have 0 ${this.config.currencyName}.`);
        if (usedToday(user.lastTopupAt)) return this.reply(message, "You already used your SHD token topup today.");
        user.balance += this.config.zeroBalanceTopupAmount ?? 1;
        user.lastTopupAt = new Date().toISOString();
        await writeJson("points.json", points);
        return this.reply(message, `Topped up: +${this.config.zeroBalanceTopupAmount ?? 1} ${this.config.currencyName}. Balance: ${user.balance}. Spend it wisely!`);
      }
      if (!hasPermission(userRole, "moderator")) return this.reply(message, "Only mods can change points.");
      const target = cleanUsername(args.shift() ?? "");
      const amount = Number.parseInt(args.shift(), 10);
      if (!target || !Number.isInteger(amount) || amount <= 0) return this.reply(message, `Usage: !${name} <user> <amount>`);
      const targetUser = ensureUser(points, target);
      targetUser.balance = Math.max(0, targetUser.balance + (name === "topup" ? amount : -amount));
      await writeJson("points.json", points);
      return this.reply(message, `${target} now has ${targetUser.balance} ${this.config.currencyName}.`);
    }

    if (name === "setpoints") {
      if (!hasPermission(userRole, "owner")) return this.reply(message, "Only the channel owner can set SHD tokens.");
      const target = cleanUsername(args.shift() ?? "");
      const amount = Number.parseInt(args.shift(), 10);
      if (!target || !Number.isInteger(amount) || amount < 0) return this.reply(message, "Usage: !setpoints <user> <amount>");
      const targetUser = ensureUser(points, target);
      targetUser.balance = amount;
      await writeJson("points.json", points);
      return this.reply(message, `${target} now has ${targetUser.balance} ${this.config.currencyName}.`);
    }

    if (name === "give") {
      const target = cleanUsername(args.shift() ?? "");
      const amount = Number.parseInt(args.shift(), 10);
      if (!target || target === message.username.toLowerCase() || !Number.isInteger(amount) || amount <= 0) {
        return this.reply(message, "Usage: !give <user> <amount>");
      }
      if (user.balance < amount) return this.reply(message, "You do not have enough points.");
      const targetUser = ensureUser(points, target);
      user.balance -= amount;
      targetUser.balance += amount;
      await writeJson("points.json", points);
      return this.reply(message, `Sent ${amount} ${this.config.currencyName} to ${target}.`);
    }

    if (name === "gamble") {
      const amount = parseAmount(args[0], user.balance);
      if (!amount) return this.reply(message, "Usage: !gamble <amount|all>");
      if (amount > user.balance) return this.reply(message, "You do not have enough points.");

      const roll = Math.floor(Math.random() * 100) + 1;
      const winThreshold = Math.floor((this.config.gambleWinChance ?? 0.48) * 100);
      const won = roll <= winThreshold;
      user.balance += won ? amount : -amount;
      await writeJson("points.json", points);
      return this.reply(message, `@${message.username} rolled ${roll}. You ${won ? "won" : "lost"} ${amount} ${this.config.currencyName}. Balance: ${user.balance}.`);
    }

    if (name === "coinflip") {
      const amount = parseAmount(args[0], user.balance);
      if (!amount) return this.reply(message, "Usage: !coinflip <amount|all>");
      if (amount > user.balance) return this.reply(message, "You do not have enough points.");
      const won = Math.random() < 0.5;
      user.balance += won ? amount : -amount;
      await writeJson("points.json", points);
      return this.reply(message, `${won ? "Heads, you win" : "Tails, you lose"} ${amount}. Balance: ${user.balance}.`);
    }

    if (name === "dice") {
      const amount = parseAmount(args[0], user.balance);
      if (!amount) return this.reply(message, "Usage: !dice <amount|all>");
      if (amount > user.balance) return this.reply(message, "You do not have enough points.");
      const roll = Math.floor(Math.random() * 6) + 1;
      const won = roll >= 4;
      user.balance += won ? amount : -amount;
      await writeJson("points.json", points);
      return this.reply(message, `Rolled ${roll}. ${won ? "You win" : "You lose"} ${amount}. Balance: ${user.balance}.`);
    }

    if (name === "slots") {
      const amount = parseAmount(args[0], user.balance);
      if (!amount) return this.reply(message, "Usage: !slots <amount|all>");
      if (amount > user.balance) return this.reply(message, "You do not have enough points.");
      const icons = ["7", "BAR", "SHD", "GG", "ACE"];
      const result = [pickRandom(icons), pickRandom(icons), pickRandom(icons)];
      const won = result.every((icon) => icon === result[0]);
      const payout = won ? amount * 4 : -amount;
      user.balance += payout;
      await writeJson("points.json", points);
      return this.reply(message, `[${result.join(" | ")}] ${won ? `Jackpot +${payout}` : `Lost ${amount}`}. Balance: ${user.balance}.`);
    }
  }

  async handleGiveaway(name, args, message, userRole) {
    const giveaway = await readJson("giveaway.json");

    if (name === "join") {
      if (!giveaway.active) return this.reply(message, "There is no active giveaway right now.");
      if (!giveaway.open) return this.reply(message, "The giveaway is locked right now.");
      if (!hasPermission(userRole, giveaway.restriction ?? "viewer")) return this.reply(message, "You do not meet the giveaway entry requirement.");
      const username = message.username.toLowerCase();
      if (giveaway.entries.includes(username)) return this.reply(message, "You are already entered.");
      giveaway.entries.push(username);
      await writeJson("giveaway.json", giveaway);
      return this.reply(message, `${message.displayName ?? message.username} joined the giveaway.`);
    }

    if (!hasPermission(userRole, "moderator")) {
      return this.reply(message, "Only mods can manage giveaways.");
    }

    const action = args.shift()?.toLowerCase();
    if (action === "start") {
      giveaway.active = true;
      giveaway.open = false;
      giveaway.keyword = args.shift()?.toLowerCase() || "join";
      giveaway.prize = args.join(" ").trim() || null;
      giveaway.restriction = "viewer";
      giveaway.entries = [];
      giveaway.lastWinner = null;
      giveaway.startedBy = message.username;
      giveaway.startedAt = new Date().toISOString();
      await writeJson("giveaway.json", giveaway);
      return this.reply(message, `Giveaway started and locked. Staff can use !giveaway open when entries should begin.`);
    }

    if (action === "open") {
      if (!giveaway.active) return this.reply(message, "Start a giveaway first.");
      giveaway.open = true;
      await writeJson("giveaway.json", giveaway);
      return this.reply(message, `Giveaway entries are open. Type !${giveaway.keyword} to join.`);
    }

    if (action === "lock" || action === "close") {
      if (!giveaway.active) return this.reply(message, "There is no active giveaway.");
      giveaway.open = false;
      await writeJson("giveaway.json", giveaway);
      return this.reply(message, "Giveaway entries are locked.");
    }

    if (action === "add") {
      const target = cleanUsername(args[0] ?? "");
      if (!target) return this.reply(message, "Usage: !giveaway add <user>");
      if (!giveaway.entries.includes(target)) giveaway.entries.push(target);
      await writeJson("giveaway.json", giveaway);
      return this.reply(message, `Added ${target} to the giveaway.`);
    }

    if (action === "remove") {
      const target = cleanUsername(args[0] ?? "");
      if (!target) return this.reply(message, "Usage: !giveaway remove <user>");
      giveaway.entries = giveaway.entries.filter((entry) => entry !== target);
      await writeJson("giveaway.json", giveaway);
      return this.reply(message, `Removed ${target} from the giveaway.`);
    }

    if (action === "restrict") {
      const role = args[0]?.toLowerCase();
      if (!["viewer", "vip", "subscriber", "moderator"].includes(role)) {
        return this.reply(message, "Usage: !giveaway restrict viewer|vip|subscriber|moderator");
      }
      giveaway.restriction = role;
      await writeJson("giveaway.json", giveaway);
      return this.reply(message, `Giveaway restriction set to ${role}.`);
    }

    if (action === "end") {
      if (!giveaway.active) return this.reply(message, "There is no active giveaway.");
      giveaway.active = false;
      giveaway.open = false;
      const winner = pickWinner(giveaway.entries);
      giveaway.lastWinner = winner;
      giveaway.history.unshift({
        winner,
        entries: giveaway.entries,
        prize: giveaway.prize,
        keyword: giveaway.keyword,
        startedBy: giveaway.startedBy,
        startedAt: giveaway.startedAt,
        endedBy: message.username,
        endedAt: new Date().toISOString()
      });
      giveaway.history = giveaway.history.slice(0, 25);
      await writeJson("giveaway.json", giveaway);
      return this.reply(message, winner ? `Giveaway winner: @${winner}${giveaway.prize ? ` for ${giveaway.prize}` : ""}` : "Giveaway ended with no entries.");
    }

    if (action === "reroll") {
      const winner = pickWinner(giveaway.entries.filter((entry) => entry !== giveaway.lastWinner));
      giveaway.lastWinner = winner;
      await writeJson("giveaway.json", giveaway);
      return this.reply(message, winner ? `New giveaway winner: @${winner}` : "No other entries to reroll.");
    }

    if (action === "status") {
      return this.reply(message, giveaway.active
        ? `Giveaway active: ${giveaway.entries.length} entries, entries are ${giveaway.open ? "open" : "locked"}, restriction ${giveaway.restriction ?? "viewer"}. Type !${giveaway.keyword} to join.`
        : "No giveaway is active.");
    }

    return this.reply(message, "Usage: !giveaway start [keyword] [prize] | open | lock | add/remove <user> | restrict <role> | end | reroll | status");
  }

  async handleModeration(name, args, message, userRole) {
    if (!hasPermission(userRole, "moderator")) {
      return this.reply(message, "Only mods can use moderation commands.");
    }

    const target = cleanUsername(args.shift() ?? "");
    if (!target) return this.reply(message, `Usage: !${name} <user>`);

    if (name === "timeout") {
      const duration = parseDuration(args.shift() ?? "60");
      const reason = args.join(" ") || "Timed out by bot";
      const ok = await this.twitchApi.timeout(target, duration, reason);
      if (ok) await logAction("timeout", { mod: message.username, target, duration, reason });
      return this.reply(message, ok ? `Timed out ${target} for ${duration}s.` : `Could not find ${target}.`);
    }

    if (name === "ban") {
      const reason = args.join(" ") || "Banned by bot";
      const ok = await this.twitchApi.ban(target, reason);
      if (ok) await logAction("ban", { mod: message.username, target, reason });
      return this.reply(message, ok ? `Banned ${target}.` : `Could not find ${target}.`);
    }

    if (name === "unban") {
      const ok = await this.twitchApi.unban(target);
      if (ok) await logAction("unban", { mod: message.username, target });
      return this.reply(message, ok ? `Unbanned ${target}.` : `Could not find ${target}.`);
    }
  }

  async handleSongs(name, args, message, userRole) {
    const songs = await readJson("songQueue.json");

    if (name === "song") {
      try {
        const spotifyCurrent = await this.spotifyApi?.getCurrentlyPlaying();
        if (spotifyCurrent) return this.reply(message, `Current song: ${spotifyCurrent}`);
      } catch (error) {
        console.error("Spotify current song failed:", error.message);
      }
      const current = songs.nowPlaying ?? songs.queue[0];
      return this.reply(message, current ? `Current song: ${songLabel(current)}` : "No song is currently playing.");
    }

    if (name === "sr" || name === "songrequest") {
      return this.reply(message, `Redeem the Song Request channel point reward (${this.config.channelPoints?.songRequestCost ?? 500} points) and enter only the song name or link.`);
    }

    if (name === "queue") {
      if (args[0] === "pending" && hasPermission(userRole, "moderator")) {
        if (!songs.pending.length) return this.reply(message, "No pending song requests.");
        const pending = songs.pending.slice(0, 5).map((song, index) => `${index + 1}. ${songLabel(song)}`).join(" | ");
        return this.reply(message, `Pending songs: ${pending}`);
      }
      if (!songs.queue.length) return this.reply(message, "Song queue is empty.");
      const next = songs.queue.slice(0, 5).map((song, index) => `${index + 1}. ${songLabel(song)}`).join(" | ");
      return this.reply(message, `Song queue: ${next}`);
    }

    if (!hasPermission(userRole, "moderator")) return this.reply(message, "Only mods can manage song requests.");

    if (name === "approve") {
      const id = args[0];
      const index = songs.pending.findIndex((song) => song.id === id);
      if (index === -1) return this.reply(message, "Could not find that pending song request.");
      const [approved] = songs.pending.splice(index, 1);
      if (approved.spotifyUri && this.spotifyApi?.enabled) await this.spotifyApi.addToQueue(approved.spotifyUri, songs.deviceId);
      approved.status = approved.spotifyUri ? "sent-to-spotify" : "queued";
      songs.queue.push(approved);
      await writeJson("songQueue.json", songs);
      return this.reply(message, `Approved ${songLabel(approved)}.`);
    }

    if (name === "skip") {
      const skipped = songs.queue.shift();
      try {
        if (this.spotifyApi?.enabled) await this.spotifyApi.skip();
      } catch (error) {
        console.error("Spotify skip failed:", error.message);
      }
      if (skipped) songs.history.unshift({ ...skipped, status: "skipped", endedAt: new Date().toISOString() });
      songs.nowPlaying = songs.queue[0] ?? null;
      await writeJson("songQueue.json", songs);
      return this.reply(message, skipped ? `Skipped ${songLabel(skipped)}.` : "No song to skip.");
    }

    if (name === "deny") {
      const id = args[0];
      let index = songs.queue.findIndex((song) => song.id === id);
      let source = songs.queue;
      if (index === -1) {
        index = songs.pending.findIndex((song) => song.id === id);
        source = songs.pending;
      }
      if (index === -1) return this.reply(message, "Could not find that song request.");
      const [denied] = source.splice(index, 1);
      songs.history.unshift({ ...denied, status: "denied", endedAt: new Date().toISOString() });
      await writeJson("songQueue.json", songs);
      return this.reply(message, `Denied ${songLabel(denied)}.`);
    }

    if (name === "clearsongs") {
      songs.history.unshift(...songs.queue.map((song) => ({ ...song, status: "cleared", endedAt: new Date().toISOString() })));
      songs.queue = [];
      songs.pending = [];
      songs.nowPlaying = null;
      await writeJson("songQueue.json", songs);
      return this.reply(message, "Song queue cleared.");
    }

    if (name === "volume") {
      const value = clamp(Number.parseInt(args[0], 10), 0, 100);
      if (!Number.isInteger(value)) return this.reply(message, "Usage: !volume <0-100>");
      songs.volume = value;
      await writeJson("songQueue.json", songs);
      return this.reply(message, `Song request volume set to ${value}.`);
    }

    if (name === "devices") {
      const devices = await this.spotifyApi?.getDevices();
      if (!devices?.length) return this.reply(message, "No Spotify devices found.");
      return this.reply(message, devices.map((device, index) => `${index + 1}. ${device.name}${device.is_active ? " active" : ""}`).join(" | "));
    }

    if (name === "setdevice") {
      const devices = await this.spotifyApi?.getDevices();
      const choice = Number.parseInt(args[0], 10);
      const device = devices?.[choice - 1];
      if (!device) return this.reply(message, "Usage: !setdevice <number from !devices>");
      songs.deviceId = device.id;
      await writeJson("songQueue.json", songs);
      return this.reply(message, `Spotify device set to ${device.name}.`);
    }
  }

  async handleWatchtimeRedemption(message) {
    const users = await readJson("users.json");
    const username = message.username.toLowerCase();
    const targetUser = users[username];
    const watchtimeMs = targetUser?.watchtimeMs ?? 0;
    return this.reply(message, `@${username} watchtime: ${formatDuration(watchtimeMs)}.`);
  }

  async handleSongRequest(query, message) {
    const songs = await readJson("songQueue.json");

    if (!songs.enabled) return this.reply(message, "Song requests are disabled right now.");
    if (!query) return this.reply(message, "Song Request needs a song name or link.");
    if (isBlockedSongQuery(query, songs)) return this.reply(message, "That song request is blocked.");

    const id = Date.now().toString(36);
    let spotifyTrack = null;
    if (songs.spotifyEnabled && this.spotifyApi?.enabled) {
      spotifyTrack = await this.spotifyApi.searchTrack(query);
      if (!spotifyTrack) return this.reply(message, "Could not find that song on Spotify.");
      const safety = validateSong(spotifyTrack, songs);
      if (!safety.ok) return this.reply(message, safety.reason);
      if (!songs.approvalRequired) await this.spotifyApi.addToQueue(spotifyTrack.uri, songs.deviceId);
    }

    const request = {
      id,
      query,
      spotifyUri: spotifyTrack?.uri ?? null,
      label: spotifyTrack?.label ?? query,
      requestedBy: message.username,
      requestedAt: new Date().toISOString(),
      status: songs.approvalRequired ? "pending" : songs.spotifyEnabled && this.spotifyApi?.enabled ? "sent-to-spotify" : "queued"
    };
    if (songs.approvalRequired) songs.pending.push(request);
    else songs.queue.push(request);
    await writeJson("songQueue.json", songs);
    return this.reply(message, `${songs.approvalRequired ? "Queued for approval" : "Added song request"} #${id}: ${spotifyTrack?.label ?? query}`);
  }

  async handleTokenPackRedemption(pack, message) {
    const amount = Number.parseInt(pack.amount, 10);
    const username = message.username.toLowerCase();
    if (!Number.isInteger(amount) || amount <= 0) return;

    const points = await readJson("points.json");
    const user = ensureUser(points, username);
    user.balance += amount;
    user.lastChannelPointPackAt = new Date().toISOString();
    await writeJson("points.json", points);

    return this.reply(message, `@${username} bought ${amount} ${this.config.currencyName}. Balance: ${user.balance}.`);
  }

  async handleOwner(name, args, message, userRole) {
    if (!hasPermission(userRole, "owner")) return this.reply(message, "Only the owner can use that command.");

    if (name === "reload") {
      const config = await readJson("config.json");
      Object.assign(this.config, config, {
        twitch: this.config.twitch,
        spotify: this.config.spotify
      });
      return this.reply(message, "Config reloaded.");
    }

    if (name === "shutdown") {
      await this.reply(message, "Shutting down.");
      process.exit(0);
    }
  }

  async handleEngagement(name, args, message, userRole) {
    const engagement = await readJson("engagement.json");
    const username = message.username.toLowerCase();

    if (name === "lurk") {
      if (!engagement.lurkers.includes(username)) engagement.lurkers.push(username);
      await writeJson("engagement.json", engagement);
      return this.reply(message, `${message.displayName ?? message.username} is now lurking. Enjoy the chill.`);
    }

    if (name === "unlurk") {
      engagement.lurkers = engagement.lurkers.filter((lurker) => lurker !== username);
      await writeJson("engagement.json", engagement);
      return this.reply(message, `Welcome back, ${message.displayName ?? message.username}.`);
    }

    if (name === "hug" || name === "bonk") {
      const target = args[0] ? `@${cleanUsername(args[0])}` : `@${message.username}`;
      return this.reply(message, name === "hug" ? `${message.username} hugs ${target}.` : `${message.username} bonks ${target}.`);
    }

    if (["clutch", "death", "mald", "throw", "ace", "win", "loss"].includes(name)) {
      if (args[0] === "reset" && hasPermission(userRole, "moderator")) {
        engagement.counters[name] = 0;
      } else if (hasPermission(userRole, "moderator") || ["clutch", "mald"].includes(name)) {
        engagement.counters[name] = (engagement.counters[name] ?? 0) + 1;
      }
      await writeJson("engagement.json", engagement);
      return this.reply(message, `${name}: ${engagement.counters[name] ?? 0}`);
    }

    if (name === "8ball") {
      const answers = ["Yes.", "No.", "Probably.", "Not today.", "Ask again after the next round.", "Absolutely.", "Doubtful."];
      return this.reply(message, pickRandom(answers));
    }

    if (name === "rate") {
      const thing = args.join(" ").trim();
      if (!thing) return this.reply(message, "Usage: !rate <thing>");
      return this.reply(message, `${thing}: ${Math.floor(Math.random() * 101)}/100`);
    }

    if (name === "choose") {
      const raw = args.join(" ");
      const options = raw.split(/\s+or\s+|,/i).map((item) => item.trim()).filter(Boolean);
      if (options.length < 2) return this.reply(message, "Usage: !choose option A or option B");
      return this.reply(message, `I choose: ${pickRandom(options)}`);
    }

    if (name === "poll") {
      if (!hasPermission(userRole, "moderator")) return this.reply(message, "Only mods can manage polls.");
      const action = args.shift()?.toLowerCase();
      if (action === "start") {
        const raw = args.join(" ");
        const [question, optionText] = raw.split("?");
        const options = optionText?.split("|").map((item) => item.trim()).filter(Boolean) ?? [];
        if (!question || options.length < 2) return this.reply(message, "Usage: !poll start Question? option 1 | option 2");
        engagement.poll = {
          active: true,
          question: `${question.trim()}?`,
          options,
          votes: {},
          startedBy: message.username,
          startedAt: new Date().toISOString()
        };
        await writeJson("engagement.json", engagement);
        return this.reply(message, `Poll started: ${engagement.poll.question} Vote with !vote 1-${options.length}.`);
      }
      if (action === "end") {
        engagement.poll.active = false;
        await writeJson("engagement.json", engagement);
        return this.reply(message, pollResults(engagement.poll));
      }
      return this.reply(message, engagement.poll.active ? pollResults(engagement.poll) : "No poll is active.");
    }

    if (name === "vote") {
      if (!engagement.poll.active) return this.reply(message, "No poll is active.");
      const option = Number.parseInt(args[0], 10);
      if (!Number.isInteger(option) || option < 1 || option > engagement.poll.options.length) {
        return this.reply(message, `Vote with !vote 1-${engagement.poll.options.length}.`);
      }
      engagement.poll.votes[username] = option - 1;
      await writeJson("engagement.json", engagement);
      return this.reply(message, `Vote counted for ${engagement.poll.options[option - 1]}.`);
    }
  }

  async handleStreamTools(name, args, message, userRole) {
    const streamState = await readJson("streamState.json");

    if (name === "title") {
      const channel = await this.twitchApi.getChannel();
      return this.reply(message, `Title: ${channel?.title ?? streamState.title ?? "not set"}`);
    }

    if (name === "category") {
      const channel = await this.twitchApi.getChannel();
      return this.reply(message, `Category: ${channel?.game_name ?? streamState.category ?? "not set"}`);
    }

    if (name === "recording") {
      return this.reply(message, `Recording: ${streamState.recording ? "on" : "off"}`);
    }

    if (["map", "agent"].includes(name)) {
      return this.reply(message, `${name}: ${streamState[name] ?? "not set"}`);
    }

    if (!hasPermission(userRole, "moderator")) {
      return this.reply(message, "Only mods can use stream tool commands.");
    }

    if (name === "overlay") {
      return this.handleOverlayCommand(args, message);
    }

    if (name === "settitle") {
      const title = args.join(" ").trim();
      if (!title) return this.reply(message, "Usage: !settitle <title>");
      const result = await this.twitchApi.updateChannel({ title });
      if (!result.ok) return this.reply(message, result.reason);
      streamState.title = title;
      await writeJson("streamState.json", streamState);
      return this.reply(message, "Stream title updated.");
    }

    if (name === "setcategory") {
      const category = args.join(" ").trim();
      if (!category) return this.reply(message, "Usage: !setcategory <category>");
      const result = await this.twitchApi.updateChannel({ category });
      if (!result.ok) return this.reply(message, result.reason);
      streamState.category = category;
      await writeJson("streamState.json", streamState);
      return this.reply(message, "Stream category updated.");
    }

    if (name === "marker") {
      const note = args.join(" ").trim() || "Stream marker";
      try {
        await this.twitchApi.createMarker(note);
      } catch (error) {
        streamState.markers.push({ note, createdBy: message.username, at: new Date().toISOString(), localOnly: true });
        await writeJson("streamState.json", streamState);
        return this.reply(message, "Could not create Twitch marker, saved a local marker instead.");
      }
      streamState.markers.push({ note, createdBy: message.username, at: new Date().toISOString(), localOnly: false });
      await writeJson("streamState.json", streamState);
      return this.reply(message, "Stream marker added.");
    }

    if (name === "clip") {
      const clip = await this.twitchApi.createClip();
      return this.reply(message, clip?.edit_url ? `Clip created: ${clip.edit_url}` : "Clip requested.");
    }

    if (name === "setmap" || name === "setagent" || name === "setduo") {
      const key = name.replace("set", "");
      streamState[key] = args.join(" ").trim() || null;
      await writeJson("streamState.json", streamState);
      return this.reply(message, `${key} updated: ${streamState[key] ?? "not set"}`);
    }

    if (["scene", "brb", "game", "cam", "handcam", "replay", "mute", "unmute", "panic"].includes(name)) {
      applyObsPlaceholder(streamState, name, args);
      await writeJson("streamState.json", streamState);
      return this.reply(message, `OBS command noted locally: !${name}. Connect OBS WebSocket later to make it live.`);
    }
  }

  async handleOverlayCommand(args, message) {
    const action = args.shift()?.toLowerCase();
    if (!action) return this.reply(message, "Usage: !overlay cam|info|ad|goal|timer");

    try {
      if (action === "cam" || action === "camera") {
        const enabled = parseOverlayBoolean(args[0]);
        if (enabled === null) return this.reply(message, "Usage: !overlay cam on|off");
        await overlayRequest(this.config, "/api/overlay/camera", { enabled });
        return this.reply(message, `Overlay camera ${enabled ? "enabled" : "disabled"}.`);
      }

      if (action === "info") {
        const mode = args[0]?.toLowerCase();
        if (!["spotify", "valorant", "premier", "lifesteal", "timer"].includes(mode)) {
          return this.reply(message, "Usage: !overlay info spotify|valorant|premier|lifesteal|timer");
        }
        await overlayRequest(this.config, "/api/overlay/info", { mode });
        return this.reply(message, `Overlay info set to ${mode}.`);
      }

      if (action === "ad") {
        const mode = args[0]?.toLowerCase();
        if (!["default", "minecraft"].includes(mode)) return this.reply(message, "Usage: !overlay ad default|minecraft");
        await overlayRequest(this.config, "/api/overlay/ad", { mode });
        return this.reply(message, `Overlay ad set to ${mode}.`);
      }

      if (action === "goal") return this.handleOverlayGoal(args, message);
      if (action === "timer") return this.handleOverlayTimer(args, message);
    } catch (error) {
      return this.reply(message, `Overlay command failed: ${error.message}`);
    }

    return this.reply(message, "Usage: !overlay cam|info|ad|goal|timer");
  }

  async handleOverlayGoal(args, message) {
    const name = args[0]?.toLowerCase();
    const current = parseOverlayInteger(args[1]);
    const target = parseOverlayInteger(args[2]);
    const map = {
      followers: ["followers", "followerTarget"],
      subs: ["subs", "subTarget"],
      lifesteal: ["lifestealSignups", "lifestealSignupTarget"]
    };
    const keys = map[name];
    if (!keys || current === null || target === null) {
      return this.reply(message, "Usage: !overlay goal followers|subs|lifesteal <current> <target>");
    }

    await overlayRequest(this.config, "/api/overlay/goals", { goals: { [keys[0]]: current, [keys[1]]: target } });
    return this.reply(message, `Overlay ${name} goal set to ${current}/${target}.`);
  }

  async handleOverlayTimer(args, message) {
    const mode = args[0]?.toLowerCase();
    if (mode === "label") {
      const title = overlayText(args[1]);
      const info = overlayText(args[2]);
      const purpose = overlayText(args.slice(3).join(" "));
      if (!title || !info || !purpose) return this.reply(message, "Usage: !overlay timer label <title> <info> <purpose>");
      await overlayRequest(this.config, "/api/overlay/timer", { eventTimer: { title, infoLabel: "INFO", info, purpose } });
      return this.reply(message, "Overlay timer labels updated.");
    }

    if (mode === "stopwatch") {
      await overlayRequest(this.config, "/api/overlay/timer", { timer: { mode: "stopwatch", running: false, baseMs: 0, startedAt: null, targetAt: null } });
      return this.reply(message, "Overlay timer set to stopwatch.");
    }

    if (mode === "countdown") {
      const targetAt = Date.parse(args[1] ?? "");
      if (!Number.isFinite(targetAt)) return this.reply(message, "Usage: !overlay timer countdown <ISO timestamp>");
      await overlayRequest(this.config, "/api/overlay/timer", { timer: { mode: "countdown", running: true, baseMs: 0, startedAt: null, targetAt } });
      return this.reply(message, "Overlay countdown target updated.");
    }

    return this.reply(message, "Usage: !overlay timer stopwatch|countdown|label");
  }

  async reply(message, text) {
    console.log(`#${this.config.twitch.channelName} ${this.config.twitch.botUsername}: ${text}`);
    await this.twitchApi.sendMessage(text, message.id);
  }
}

function overlayText(value = "") {
  return String(value).replaceAll("_", " ").trim();
}

function fillTemplate(response, message, args) {
  return response
    .replaceAll("{user}", message.displayName ?? message.username)
    .replaceAll("{args}", args.join(" "));
}

function ensureUser(points, username) {
  const key = username.toLowerCase();
  points[key] ??= { balance: 0, lastDailyAt: null };
  return points[key];
}

function usedToday(isoDate) {
  if (!isoDate) return false;
  return new Date(isoDate).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
}

function pickWinner(entries) {
  if (!entries.length) return null;
  return entries[Math.floor(Math.random() * entries.length)];
}

function songLabel(song) {
  return `#${song.id} ${song.label ?? song.query} (requested by ${song.requestedBy})`;
}

function isBlockedSongQuery(query, songs) {
  const lower = query.toLowerCase();
  return (songs.blockedTerms ?? []).some((term) => lower.includes(String(term).toLowerCase()));
}

function validateSong(track, songs) {
  if (!songs.allowExplicit && track.explicit) return { ok: false, reason: "Explicit songs are not allowed." };
  if (songs.maxDurationMs && track.durationMs && track.durationMs > songs.maxDurationMs) {
    return { ok: false, reason: "That song is too long." };
  }
  const blockedArtist = track.artists?.find((artist) =>
    (songs.blockedArtists ?? []).some((blocked) => artist.toLowerCase().includes(String(blocked).toLowerCase()))
  );
  if (blockedArtist) return { ok: false, reason: "That artist is blocked." };
  return { ok: true };
}

function pollResults(poll) {
  const counts = poll.options.map(() => 0);
  for (const vote of Object.values(poll.votes ?? {})) counts[vote] += 1;
  const result = poll.options.map((option, index) => `${index + 1}. ${option}: ${counts[index]}`).join(" | ");
  return `Poll: ${poll.question} ${result}`;
}

function applyObsPlaceholder(streamState, name, args) {
  if (name === "scene") streamState.obs.currentScene = args.join(" ") || streamState.obs.currentScene;
  if (name === "brb") streamState.obs.currentScene = "BRB";
  if (name === "game") streamState.obs.currentScene = "Gameplay";
  if (name === "cam") streamState.obs.camera = !streamState.obs.camera;
  if (name === "handcam") streamState.obs.handcam = !streamState.obs.handcam;
  if (name === "mute") {
    const source = args.join(" ").trim();
    if (source && !streamState.obs.mutedSources.includes(source)) streamState.obs.mutedSources.push(source);
  }
  if (name === "unmute") {
    const source = args.join(" ").trim();
    streamState.obs.mutedSources = streamState.obs.mutedSources.filter((item) => item !== source);
  }
  if (name === "panic") {
    streamState.obs.currentScene = "BRB";
    streamState.obs.mutedSources = [...new Set([...streamState.obs.mutedSources, "Mic", "Desktop Audio"])];
  }
}
