export class TwitchApi {
  constructor(config, auth) {
    this.config = config;
    this.auth = auth;
    this.tokenProfile = auth?.tokenProfile ?? config.twitch;
    this.baseUrl = "https://api.twitch.tv/helix";
    this.chatQueue = [];
    this.chatQueueRunning = false;
    this.lastChatSentAt = 0;
  }

  async sendMessage(message, replyParentMessageId) {
    return this.enqueueChatMessage({
      message: message.slice(0, this.config.maxChatMessageLength ?? 450),
      replyParentMessageId
    });
  }

  async getStream() {
    const data = await this.request(`/streams?user_id=${this.config.twitch.channelId}`);
    return data.data?.[0] ?? null;
  }

  async getChannel() {
    const data = await this.request(`/channels?broadcaster_id=${this.config.twitch.channelId}`);
    return data.data?.[0] ?? null;
  }

  async getGameId(name) {
    const data = await this.request(`/games?name=${encodeURIComponent(name)}`);
    return data.data?.[0]?.id ?? null;
  }

  async updateChannel({ title, category }) {
    const body = {};
    if (title) body.title = title;
    if (category) {
      const gameId = await this.getGameId(category);
      if (!gameId) return { ok: false, reason: `Could not find category "${category}".` };
      body.game_id = gameId;
    }

    await this.request(`/channels?broadcaster_id=${this.config.twitch.channelId}`, {
      method: "PATCH",
      body
    });
    return { ok: true };
  }

  async createMarker(description) {
    return this.request("/streams/markers", {
      method: "POST",
      body: {
        user_id: this.config.twitch.channelId,
        description: description.slice(0, 140)
      }
    });
  }

  async createClip() {
    const data = await this.request(`/clips?broadcaster_id=${this.config.twitch.channelId}`, {
      method: "POST"
    });
    return data.data?.[0] ?? null;
  }

  async getUserId(login) {
    const data = await this.request(`/users?login=${encodeURIComponent(login.replace(/^@/, ""))}`);
    return data.data?.[0]?.id ?? null;
  }

  async getChatters() {
    const chatters = [];
    let cursor = null;

    do {
      const params = new URLSearchParams({
        broadcaster_id: this.config.twitch.channelId,
        moderator_id: this.config.twitch.botUserId,
        first: "1000"
      });
      if (cursor) params.set("after", cursor);

      const data = await this.request(`/chat/chatters?${params.toString()}`);
      chatters.push(...(data.data ?? []));
      cursor = data.pagination?.cursor ?? null;
    } while (cursor);

    return chatters;
  }

  async timeout(login, seconds, reason) {
    const userId = await this.getUserId(login);
    if (!userId) return false;

    await this.request(
      `/moderation/bans?broadcaster_id=${this.config.twitch.channelId}&moderator_id=${this.config.twitch.botUserId}`,
      {
        method: "POST",
        body: {
          data: {
            user_id: userId,
            duration: seconds,
            reason
          }
        }
      }
    );
    return true;
  }

  async ban(login, reason) {
    const userId = await this.getUserId(login);
    if (!userId) return false;

    await this.request(
      `/moderation/bans?broadcaster_id=${this.config.twitch.channelId}&moderator_id=${this.config.twitch.botUserId}`,
      {
        method: "POST",
        body: {
          data: {
            user_id: userId,
            reason
          }
        }
      }
    );
    return true;
  }

  async unban(login) {
    const userId = await this.getUserId(login);
    if (!userId) return false;

    await this.request(
      `/moderation/bans?broadcaster_id=${this.config.twitch.channelId}&moderator_id=${this.config.twitch.botUserId}&user_id=${userId}`,
      { method: "DELETE" }
    );
    return true;
  }

  async request(path, options = {}) {
    const response = await this.fetchHelix(path, options);

    if (response.status === 401 && !options.skipRefresh) {
      await this.auth?.refreshAccessToken();
      return this.request(path, { ...options, skipRefresh: true });
    }

    if (response.status === 429 && !options.skipRateLimitRetry) {
      await sleep(rateLimitDelayMs(response));
      return this.request(path, { ...options, skipRateLimitRetry: true });
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Twitch API ${response.status}: ${text}`);
    }

    if (response.status === 204) {
      return {};
    }

    return response.json();
  }

  async fetchHelix(path, options = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "Authorization": `Bearer ${this.tokenProfile.accessToken}`,
        "Client-Id": this.config.twitch.clientId,
        "Content-Type": "application/json"
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    return response;
  }

  enqueueChatMessage(payload) {
    const maxQueue = this.config.maxOutboundChatQueue ?? 25;
    if (this.chatQueue.length >= maxQueue) {
      return Promise.reject(new Error(`Outbound chat queue is full (${maxQueue}).`));
    }

    return new Promise((resolve, reject) => {
      this.chatQueue.push({ payload, resolve, reject });
      void this.runChatQueue();
    });
  }

  async runChatQueue() {
    if (this.chatQueueRunning) return;
    this.chatQueueRunning = true;

    try {
      while (this.chatQueue.length) {
        const item = this.chatQueue.shift();
        const interval = this.config.outboundChatIntervalMs ?? 1200;
        const waitMs = Math.max(0, this.lastChatSentAt + interval - Date.now());
        if (waitMs > 0) await sleep(waitMs);

        try {
          await this.sendChatMessageNow(item.payload);
          this.lastChatSentAt = Date.now();
          item.resolve();
        } catch (error) {
          item.reject(error);
        }
      }
    } finally {
      this.chatQueueRunning = false;
    }
  }

  async sendChatMessageNow({ message, replyParentMessageId }) {
    const body = {
      broadcaster_id: this.config.twitch.channelId,
      sender_id: this.config.twitch.botUserId,
      message
    };

    if (replyParentMessageId) {
      body.reply_parent_message_id = replyParentMessageId;
    }

    await this.request("/chat/messages", {
      method: "POST",
      body
    });
  }
}

function rateLimitDelayMs(response) {
  const resetSeconds = Number(response.headers.get("Ratelimit-Reset"));
  if (Number.isFinite(resetSeconds) && resetSeconds > 0) {
    return Math.max(1000, resetSeconds * 1000 - Date.now() + 250);
  }
  return 5000;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
