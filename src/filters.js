import { hasPermission } from "./permissions.js";
import { logAction } from "./logger.js";

const urlPattern = /\b(?:https?:\/\/|www\.|discord\.gg\/|twitch\.tv\/|[\w-]+\.(?:com|net|org|gg|tv|io|me)\b)/i;

export class ChatGuard {
  constructor(config, twitchApi) {
    this.config = config;
    this.twitchApi = twitchApi;
    this.permits = new Map();
    this.recentMessages = new Map();
  }

  permit(username, seconds = 60) {
    const key = username.replace(/^@/, "").toLowerCase();
    this.permits.set(key, Date.now() + seconds * 1000);
  }

  async inspect(message, userRole) {
    if (!this.config.filters?.enabled) return false;
    if (hasPermission(userRole, "moderator")) return false;

    const violation = this.findViolation(message);
    if (!violation) return false;

    if (violation.action === "ban") {
      console.log(`Filter auto-ban: ${message.username} -> ${violation.reason}`);
      await this.twitchApi.ban(message.username, `Auto-ban: ${violation.reason}`);
      await logAction("auto-ban", {
        user: message.username,
        reason: violation.reason,
        message: message.text
      });
      return true;
    }

    console.log(`Filter noticed ${message.username} -> ${violation.reason}; no moderation action taken.`);
    return false;
  }

  findViolation(message) {
    const filters = this.config.filters;
    const text = message.text.trim();
    const username = message.username.toLowerCase();

    if (filters.linkFilter && urlPattern.test(text) && !this.hasPermit(username) && !isAllowedLink(text, filters.allowedDomains ?? [])) {
      return { reason: "links are not allowed", timeoutSeconds: filters.linkTimeoutSeconds ?? 30 };
    }

    if (filters.capsFilter && isCapsSpam(text, filters.capsMinLength ?? 18, filters.capsRatio ?? 0.7)) {
      return { reason: "caps spam", timeoutSeconds: filters.spamTimeoutSeconds ?? 20 };
    }

    if (filters.symbolFilter && isSymbolSpam(text, filters.symbolMinLength ?? 16, filters.symbolRatio ?? 0.55)) {
      return { reason: "symbol spam", timeoutSeconds: filters.spamTimeoutSeconds ?? 20 };
    }

    if (filters.emoteFilter && isEmoteSpam(text, filters.emoteMaxCount ?? 10)) {
      return { reason: "emote spam", timeoutSeconds: filters.spamTimeoutSeconds ?? 20 };
    }

    if (filters.mentionFilter && countMentions(text) > (filters.maxMentions ?? 4)) {
      return { reason: "too many mentions", timeoutSeconds: filters.spamTimeoutSeconds ?? 20 };
    }

    if (containsBlockedPhrase(text, filters.bannedWords ?? [])) {
      return { reason: "banned word", timeoutSeconds: filters.spamTimeoutSeconds ?? 20 };
    }

    if (containsBlockedPhrase(text, filters.scamPatterns ?? [])) {
      return { reason: "scam pattern", action: "ban" };
    }

    if (filters.repeatFilter && this.isRepeated(username, text, filters.repeatWindowSeconds ?? 20)) {
      return { reason: "repeated messages", timeoutSeconds: filters.spamTimeoutSeconds ?? 20 };
    }

    return null;
  }

  hasPermit(username) {
    const until = this.permits.get(username);
    if (!until) return false;
    if (until < Date.now()) {
      this.permits.delete(username);
      return false;
    }
    return true;
  }

  isRepeated(username, text, windowSeconds) {
    const now = Date.now();
    const previous = this.recentMessages.get(username) ?? [];
    const active = previous.filter((entry) => now - entry.at <= windowSeconds * 1000);
    const normalized = text.toLowerCase();
    const repeats = active.filter((entry) => entry.text === normalized).length;

    active.push({ text: normalized, at: now });
    this.recentMessages.set(username, active);
    return repeats >= 2;
  }
}

function isAllowedLink(text, allowedDomains) {
  const lower = text.toLowerCase();
  return allowedDomains.some((domain) => lower.includes(domain.toLowerCase()));
}

function isCapsSpam(text, minLength, ratio) {
  const letters = [...text].filter((char) => /[a-z]/i.test(char));
  if (letters.length < minLength) return false;
  const caps = letters.filter((char) => char === char.toUpperCase()).length;
  return caps / letters.length >= ratio;
}

function isSymbolSpam(text, minLength, ratio) {
  if (text.length < minLength) return false;
  const symbols = [...text].filter((char) => !/[a-z0-9\s]/i.test(char)).length;
  return symbols / text.length >= ratio;
}

function countMentions(text) {
  return (text.match(/@\w+/g) ?? []).length;
}

function containsBlockedPhrase(text, phrases) {
  const lower = text.toLowerCase();
  return phrases.some((phrase) => phrase && lower.includes(String(phrase).toLowerCase()));
}

function isEmoteSpam(text, maxCount) {
  const emoteLikeWords = text.split(/\s+/).filter((word) => /^[A-Z][A-Za-z0-9]{2,}$/.test(word));
  return emoteLikeWords.length > maxCount;
}
