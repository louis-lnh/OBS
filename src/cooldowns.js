const cooldowns = new Map();

export function isCoolingDown(key, seconds) {
  const now = Date.now();
  const until = cooldowns.get(key) ?? 0;
  if (until > now) {
    return Math.ceil((until - now) / 1000);
  }

  cooldowns.set(key, now + seconds * 1000);
  return 0;
}
