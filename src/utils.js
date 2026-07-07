export function cleanUsername(value = "") {
  return value.replace(/^@/, "").trim().toLowerCase();
}

export function parseDuration(input) {
  const match = String(input).match(/^(\d+)(s|m|h|d)?$/i);
  if (!match) return 60;
  const amount = Number.parseInt(match[1], 10);
  const unit = match[2]?.toLowerCase();
  if (unit === "d") return amount * 86400;
  if (unit === "h") return amount * 3600;
  if (unit === "m") return amount * 60;
  return amount;
}

export function parseAmount(input, balance) {
  if (input?.toLowerCase() === "all") return balance;
  const value = Number.parseInt(input, 10);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function pickRandom(values) {
  return values[Math.floor(Math.random() * values.length)];
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
