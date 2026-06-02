import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { rootDir } from "./paths.js";

async function loadEnv() {
  try {
    const env = await readFile(join(rootDir, ".env"), "utf8");
    for (const line of env.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // .env is optional; deployment platforms usually provide environment variables directly.
  }
}

export { loadEnv };
