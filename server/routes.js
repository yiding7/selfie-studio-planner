import { photoTypes, allowedImageProtocols } from "./config.js";
import { sendJson, sendEmpty, readBody } from "./http.js";
import { callModel, callResearchAgent, getProviderConfig } from "./llm.js";
import { shouldRunResearch } from "./research.js";
import { hydrateReferenceImages, getImageSearchProviderConfig, getImageSearchMissingConfigMessage } from "./image-search.js";

function getPublicConfig() {
  const provider = getImageSearchProviderConfig();
  const llmProvider = getProviderConfig();
  return {
    llm: {
      configured: Boolean(llmProvider.apiKey),
      provider: llmProvider.name
    },
    imageSearch: {
      enabled: Boolean(provider),
      provider: provider?.name || null
    }
  };
}

async function handleGenerate(req, res) {
  try {
    const body = await readBody(req);
    const photoType = String(body.photoType || "");
    const mode = body.mode === "lucky" ? "lucky" : "prompt";
    const prompt = String(body.prompt || "").slice(0, 1200);
    const imageSearch = body.imageSearch === true || body.webSearch === true;

    if (!photoTypes.has(photoType)) {
      sendJson(res, 400, { error: "Choose a valid subject type." });
      return;
    }
    if (mode === "prompt" && !prompt.trim()) {
      sendJson(res, 400, { error: "Enter a theme prompt, or use I'm Feeling Lucky." });
      return;
    }
    if (imageSearch && !getImageSearchProviderConfig()) {
      sendJson(res, 503, { error: getImageSearchMissingConfigMessage() });
      return;
    }

    const backgroundContext = shouldRunResearch(mode, prompt)
      ? await callResearchAgent({ photoType, prompt })
      : {};

    const plan = await callModel({ photoType, prompt, mode, backgroundContext });
    await hydrateReferenceImages(plan, { imageSearch, photoType, prompt, backgroundContext });
    sendJson(res, 200, { plan, backgroundContext, generatedAt: new Date().toISOString() });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message || "Generation failed. Please try again later." });
  }
}

async function handleImageProxy(req, res) {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    const rawUrl = requestUrl.searchParams.get("url");
    if (!rawUrl) {
      sendEmpty(res, 400);
      return;
    }

    const imageUrl = new URL(rawUrl);
    if (!allowedImageProtocols.has(imageUrl.protocol)) {
      sendEmpty(res, 400);
      return;
    }

    const response = await fetch(imageUrl, {
      headers: {
        "user-agent": "Mozilla/5.0 PhotoInspiration/0.1",
        accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        referer: `${imageUrl.origin}/`
      }
    });

    if (!response.ok) {
      sendEmpty(res, response.status);
      return;
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      sendEmpty(res, 415);
      return;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    res.writeHead(200, {
      "content-type": contentType,
      "cache-control": "public, max-age=86400",
      "access-control-allow-origin": "*"
    });
    res.end(buffer);
  } catch {
    sendEmpty(res, 502);
  }
}

export { getPublicConfig, handleGenerate, handleImageProxy };
