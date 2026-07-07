const DEFAULT_OVERLAY_URL = "http://127.0.0.1:5174";

export function overlayBaseUrl(config = {}) {
  return (config.overlayControl?.url ?? process.env.OVERLAY_CONTROL_URL ?? DEFAULT_OVERLAY_URL).replace(/\/$/, "");
}

export async function getOverlayState(config = {}) {
  return overlayRequest(config, "/api/overlay/state");
}

export async function updateOverlayState(config = {}, payload) {
  return overlayRequest(config, "/api/overlay/state", payload);
}

export async function overlayRequest(config = {}, path, payload) {
  const response = await fetch(`${overlayBaseUrl(config)}${path}`, {
    method: payload ? "POST" : "GET",
    headers: payload ? { "Content-Type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error ?? `Overlay API ${response.status}`);
  }

  return body;
}

export function parseOverlayBoolean(value) {
  if (["on", "true", "yes", "1", "enabled", "enable"].includes(String(value).toLowerCase())) return true;
  if (["off", "false", "no", "0", "disabled", "disable"].includes(String(value).toLowerCase())) return false;
  return null;
}

export function parseOverlayInteger(value) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : null;
}
