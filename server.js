import { createServer } from "node:http";
import { loadEnv } from "./server/env.js";
import { sendEmpty, sendJson } from "./server/http.js";
import { getPublicConfig, handleGenerate, handleImageProxy } from "./server/routes.js";
import { serveStatic } from "./server/static.js";

await loadEnv();

const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || "127.0.0.1";

createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/generate") {
    handleGenerate(req, res);
    return;
  }
  if ((req.method === "GET" || req.method === "HEAD") && req.url === "/api/config") {
    if (req.method === "HEAD") sendEmpty(res, 200, { "content-type": "application/json; charset=utf-8" });
    else sendJson(res, 200, getPublicConfig());
    return;
  }
  if ((req.method === "GET" || req.method === "HEAD") && req.url?.startsWith("/api/image")) {
    handleImageProxy(req, res);
    return;
  }
  if (req.method === "GET" || req.method === "HEAD") {
    serveStatic(req, res);
    return;
  }
  res.writeHead(405);
  res.end("Method not allowed");
}).listen(port, host, () => {
  console.log(`Selfie Studio Planner is running at http://127.0.0.1:${port}`);
});
