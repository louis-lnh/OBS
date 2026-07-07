import { mkdir, appendFile } from "node:fs/promises";
import path from "node:path";

const logsDir = path.resolve("logs");

export async function logAction(type, payload) {
  await mkdir(logsDir, { recursive: true });
  const entry = {
    type,
    at: new Date().toISOString(),
    ...payload
  };
  await appendFile(path.join(logsDir, "bot-actions.jsonl"), `${JSON.stringify(entry)}\n`);
}
