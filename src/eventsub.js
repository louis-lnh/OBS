import WebSocket from "ws";

const EVENTSUB_URL = "wss://eventsub.wss.twitch.tv/ws";

export class EventSubChat {
  constructor(config, twitchApi, onMessage, onEvent, options = {}) {
    this.config = config;
    this.twitchApi = twitchApi;
    this.onMessage = onMessage;
    this.onEvent = onEvent;
    this.options = options;
    this.reconnectTimer = null;
  }

  connect(url = EVENTSUB_URL) {
    this.socket = new WebSocket(url);

    this.socket.on("open", () => {
      console.log("Connected to Twitch EventSub WebSocket.");
    });

    this.socket.on("message", async (raw) => {
      try {
        await this.handleFrame(JSON.parse(raw.toString()));
      } catch (error) {
        console.error("Failed to handle EventSub frame:", error.message);
      }
    });

    this.socket.on("close", () => {
      console.log("EventSub WebSocket closed. Reconnecting soon...");
      this.scheduleReconnect();
    });

    this.socket.on("error", (error) => {
      console.error("EventSub WebSocket error:", error.message);
    });
  }

  async handleFrame(frame) {
    const type = frame.metadata?.message_type;

    if (type === "session_welcome") {
      if (this.options.chat === false) {
        await this.subscribeOptionalEvents(frame.payload.session.id, this.options.eventKeys ?? [], true);
      } else {
        await this.subscribeToChat(frame.payload.session.id);
      }
      return;
    }

    if (type === "session_reconnect") {
      const oldSocket = this.socket;
      this.connect(frame.payload.session.reconnect_url);
      oldSocket.close();
      return;
    }

    if (type !== "notification") return;

    await this.handleNotification(frame.payload);
  }

  async handleNotification(payload) {
    const event = payload.event;
    const subscriptionType = payload.subscription?.type;

    if (subscriptionType !== "channel.chat.message") {
      await this.onEvent?.(subscriptionType, event);
      return;
    }

    if (event.chatter_user_login?.toLowerCase() === this.config.twitch.botUsername) return;

    if (event.channel_points_custom_reward_id) {
      console.log(`Channel Points reward message: ${event.channel_points_custom_reward_id} from ${event.chatter_user_login}`);
    }

    await this.onMessage({
      id: event.message_id,
      text: event.message?.text ?? "",
      username: event.chatter_user_login,
      displayName: event.chatter_user_name,
      userId: event.chatter_user_id,
      customRewardId: event.channel_points_custom_reward_id ?? null,
      badges: event.badges ?? []
    });
  }

  async subscribeToChat(sessionId) {
    await this.subscribe(sessionId, "channel.chat.message", "1", {
      broadcaster_user_id: this.config.twitch.channelId,
      user_id: this.config.twitch.botUserId
    });

    await this.subscribeOptionalEvents(sessionId, this.options.eventKeys, false);

    console.log(`Listening to #${this.config.twitch.channelName} as ${this.config.twitch.botUsername}.`);
  }

  async subscribeOptionalEvents(sessionId, eventKeys = null, force = false) {
    const events = this.config.eventSub ?? {};
    const optional = [
      ["follow", "channel.follow", "2", {
        broadcaster_user_id: this.config.twitch.channelId,
        moderator_user_id: this.config.twitch.botUserId
      }],
      ["subscribe", "channel.subscribe", "1", { broadcaster_user_id: this.config.twitch.channelId }],
      ["giftSub", "channel.subscription.gift", "1", { broadcaster_user_id: this.config.twitch.channelId }],
      ["raid", "channel.raid", "1", { to_broadcaster_user_id: this.config.twitch.channelId }],
      ["cheer", "channel.cheer", "1", { broadcaster_user_id: this.config.twitch.channelId }],
      ["channelPointRedemption", "channel.channel_points_custom_reward_redemption.add", "1", { broadcaster_user_id: this.config.twitch.channelId }]
    ];

    for (const [key, type, version, condition] of optional) {
      if (eventKeys && !eventKeys.includes(key)) continue;
      if (!force && !events[key]) continue;
      try {
        await this.subscribe(sessionId, type, version, condition);
      } catch (error) {
        console.error(`Could not subscribe to ${type}:`, error.message);
      }
    }
  }

  async subscribe(sessionId, type, version, condition) {
    await this.twitchApi.request("/eventsub/subscriptions", {
      method: "POST",
      body: {
        type,
        version,
        condition,
        transport: {
          method: "websocket",
          session_id: sessionId
        }
      }
    });
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }
}
