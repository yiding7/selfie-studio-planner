import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { mimeTypes } from "./config.js";
import { sendEmpty } from "./http.js";
import { publicDir } from "./paths.js";

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const safePath = normalize(url.pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath === "/" ? "index.html" : safePath);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(filePath);
    const headers = { "content-type": mimeTypes[extname(filePath)] || "application/octet-stream" };
    if (req.method === "HEAD") {
      sendEmpty(res, 200, headers);
      return;
    }
    res.writeHead(200, headers);
    res.end(content);
  } catch {
    const index = await readFile(join(publicDir, "index.html"));
    const headers = { "content-type": mimeTypes[".html"] };
    if (req.method === "HEAD") {
      sendEmpty(res, 200, headers);
      return;
    }
    res.writeHead(200, headers);
    res.end(index);
  }
}

export { serveStatic };
