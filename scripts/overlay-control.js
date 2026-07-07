import dotenv from "dotenv";
import { overlayRequest, parseOverlayBoolean, parseOverlayInteger } from "../src/overlayControl.js";

dotenv.config();

const [command, ...args] = process.argv.slice(2);
const config = { overlayControl: { url: process.env.OVERLAY_CONTROL_URL } };

try {
  const result = await run(command, args);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

async function run(command, args) {
  if (command === "state") return overlayRequest(config, "/api/overlay/state");

  if (command === "cam" || command === "camera") {
    const enabled = parseOverlayBoolean(args[0]);
    if (enabled === null) throw new Error("Usage: npm run overlay:control -- cam on|off");
    return overlayRequest(config, "/api/overlay/camera", { enabled });
  }

  if (command === "info") {
    const mode = args[0];
    if (!["spotify", "valorant", "premier", "lifesteal", "timer"].includes(mode)) {
      throw new Error("Usage: npm run overlay:control -- info spotify|valorant|premier|lifesteal|timer");
    }
    return overlayRequest(config, "/api/overlay/info", { mode });
  }

  if (command === "ad") {
    const mode = args[0];
    if (!["default", "minecraft"].includes(mode)) throw new Error("Usage: npm run overlay:control -- ad default|minecraft");
    return overlayRequest(config, "/api/overlay/ad", { mode });
  }

  if (command === "goal") {
    return setGoal(args);
  }

  if (command === "timer-title") {
    const [title, info = "COUNTDOWN", ...purposeParts] = args;
    const purpose = purposeParts.join(" ");
    if (!title || !purpose) throw new Error("Usage: npm run overlay:control -- timer-title <title> <info> <purpose>");
    return overlayRequest(config, "/api/overlay/timer", { eventTimer: { title, infoLabel: "INFO", info, purpose } });
  }

  if (command === "countdown") {
    const targetAt = parseTargetAt(args[0]);
    if (!targetAt) throw new Error("Usage: npm run overlay:control -- countdown <ISO timestamp>");
    return overlayRequest(config, "/api/overlay/timer", { timer: { mode: "countdown", running: true, baseMs: 0, startedAt: null, targetAt } });
  }

  throw new Error("Usage: npm run overlay:control -- state|cam|info|ad|goal|timer-title|countdown");
}

async function setGoal(args) {
  const [name, currentRaw, targetRaw] = args;
  const current = parseOverlayInteger(currentRaw);
  const target = parseOverlayInteger(targetRaw);
  if (!name || current === null || target === null) {
    throw new Error("Usage: npm run overlay:control -- goal followers|subs|lifesteal <current> <target>");
  }

  const map = {
    followers: ["followers", "followerTarget"],
    subs: ["subs", "subTarget"],
    lifesteal: ["lifestealSignups", "lifestealSignupTarget"]
  };
  const keys = map[name];
  if (!keys) throw new Error("Goal must be followers, subs, or lifesteal.");

  return overlayRequest(config, "/api/overlay/goals", { goals: { [keys[0]]: current, [keys[1]]: target } });
}

function parseTargetAt(value) {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}
