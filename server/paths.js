import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const rootDir = fileURLToPath(new URL("..", import.meta.url));
export const publicDir = join(rootDir, "public");
