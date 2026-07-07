import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const sourceDirs = [path.resolve("src"), path.resolve("scripts")];
const files = [];

for (const sourceDir of sourceDirs) {
  const dirFiles = (await readdir(sourceDir))
  .filter((file) => file.endsWith(".js"))
  .map((file) => path.join(sourceDir, file));
  files.push(...dirFiles);
}

let failed = false;

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) failed = true;
}

process.exitCode = failed ? 1 : 0;
