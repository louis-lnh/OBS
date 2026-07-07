import { readJson, writeJson } from "./storage.js";

const WATCHTIME_SESSION_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_CHATTER_POLL_INTERVAL_MS = 60 * 1000;

export class UserTracker {
  constructor(config, twitchApi) {
    this.config = config;
    this.twitchApi = twitchApi;
    this.writeQueue = Promise.resolve();
    this.pollTimer = null;
    this.lastPollAt = null;
    this.pollingActive = false;
    this.pollingUnavailableLogged = false;
  }

  start() {
    const intervalMs = this.config.watchtimePollIntervalMs ?? DEFAULT_CHATTER_POLL_INTERVAL_MS;
    if (intervalMs <= 0) return;

    void this.pollChatters();
    this.pollTimer = setInterval(() => {
      void this.pollChatters();
    }, intervalMs);
  }

  async recordMessage(message) {
    return this.enqueueWrite(() => this.recordMessageNow(message));
  }

  async recordMessageNow(message) {
    const users = await readJson("users.json");
    const points = await readJson("points.json");
    const events = await readJson("events.json");
    const username = message.username.toLowerCase();
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const user = users[username] ?? {
      firstSeenAt: now.toISOString(),
      lastSeenAt: null,
      messageCount: 0,
      seenDates: [],
      firstMessageSent: false
    };

    const isFirstMessage = user.messageCount === 0;
    const isReturning = !isFirstMessage && user.lastSeenAt && Date.now() - Date.parse(user.lastSeenAt) > 7 * 24 * 60 * 60 * 1000;
    const previousSeenAt = user.lastSeenAt ? Date.parse(user.lastSeenAt) : null;
    const messageGapMs = previousSeenAt ? now.getTime() - previousSeenAt : 0;
    if (!this.pollingActive && messageGapMs > 0 && messageGapMs <= WATCHTIME_SESSION_WINDOW_MS) {
      user.watchtimeMs = (user.watchtimeMs ?? 0) + messageGapMs;
    } else {
      user.watchtimeMs ??= 0;
    }
    user.lastSeenAt = now.toISOString();
    user.messageCount += 1;
    if (!user.seenDates.includes(today)) user.seenDates.push(today);
    users[username] = user;

    points[username] ??= { balance: 0, lastDailyAt: null, streakDays: 0 };
    points[username].lastActiveAt = now.toISOString();
    points[username].messageCount = (points[username].messageCount ?? 0) + 1;
    points[username].streakDays = currentStreak(user.seenDates);

    await writeJson("users.json", users);
    await writeJson("points.json", points);

    if (isFirstMessage && events.firstTimeChatter?.enabled) {
      await this.twitchApi.sendMessage(events.firstTimeChatter.message.replaceAll("{user}", message.username));
    } else if (isReturning && events.returningChatter?.enabled) {
      await this.twitchApi.sendMessage(events.returningChatter.message.replaceAll("{user}", message.username));
    }
  }

  async pollChatters() {
    try {
      const stream = await this.twitchApi.getStream();
      if (!stream) {
        this.lastPollAt = null;
        return;
      }

      const chatters = await this.twitchApi.getChatters();
      const now = new Date();
      const previousPollAt = this.lastPollAt;
      this.lastPollAt = now.getTime();
      this.pollingActive = true;

      if (!previousPollAt) return;

      const elapsedMs = Math.min(now.getTime() - previousPollAt, this.config.watchtimePollMaxGapMs ?? 2 * DEFAULT_CHATTER_POLL_INTERVAL_MS);
      if (elapsedMs <= 0) return;

      await this.enqueueWrite(async () => {
        const users = await readJson("users.json");
        const today = now.toISOString().slice(0, 10);

        for (const chatter of chatters) {
          const username = String(chatter.user_login ?? chatter.user_name ?? "").toLowerCase();
          if (!username || username === this.config.twitch.botUsername) continue;

          const user = users[username] ?? {
            firstSeenAt: now.toISOString(),
            lastSeenAt: null,
            messageCount: 0,
            seenDates: [],
            firstMessageSent: false,
            watchtimeMs: 0
          };

          user.watchtimeMs = (user.watchtimeMs ?? 0) + elapsedMs;
          user.lastSeenAt = now.toISOString();
          if (!user.seenDates.includes(today)) user.seenDates.push(today);
          users[username] = user;
        }

        await writeJson("users.json", users);
      });
    } catch (error) {
      this.pollingActive = false;
      this.lastPollAt = null;
      if (!this.pollingUnavailableLogged) {
        console.error(`Watchtime chatter polling unavailable: ${error.message}`);
        this.pollingUnavailableLogged = true;
      }
    }
  }

  enqueueWrite(task) {
    this.writeQueue = this.writeQueue.catch(() => null).then(task);
    return this.writeQueue;
  }
}

function currentStreak(dates) {
  const set = new Set(dates);
  let streak = 0;
  const cursor = new Date();

  while (set.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return streak;
}
