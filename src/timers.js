import { readJson } from "./storage.js";

export class TimerManager {
  constructor(config, twitchApi) {
    this.config = config;
    this.twitchApi = twitchApi;
    this.chatMessagesSinceTimer = 0;
    this.lastSentByName = new Map();
    this.interval = null;
  }

  start() {
    if (!this.config.timersEnabled) return;
    this.interval = setInterval(() => {
      this.tick().catch((error) => console.error("Timer failed:", error.message));
    }, 15000);
  }

  recordChatMessage() {
    this.chatMessagesSinceTimer += 1;
  }

  async tick() {
    const timers = await readJson("timers.json", []);
    const now = Date.now();

    for (const timer of timers) {
      if (!timer.enabled) continue;
      if (this.chatMessagesSinceTimer < (timer.minChatMessages ?? 1)) continue;

      const intervalMs = (timer.intervalMinutes ?? 20) * 60 * 1000;
      const lastSent = this.lastSentByName.get(timer.name) ?? 0;
      if (now - lastSent < intervalMs) continue;

      await this.twitchApi.sendMessage(timer.message);
      this.lastSentByName.set(timer.name, now);
      this.chatMessagesSinceTimer = 0;
      return;
    }
  }
}
