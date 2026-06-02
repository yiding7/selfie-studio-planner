import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
await loadEnv();

const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || "127.0.0.1";
const imageApiCache = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};
const allowedImageProtocols = new Set(["http:", "https:"]);

const photoTypes = new Set(["solo", "couple", "family-of-three", "parent-child", "family", "friends", "best-friends", "group"]);
async function loadEnv() {
  try {
    const env = await readFile(join(__dirname, ".env"), "utf8");
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

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

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

function sendEmpty(res, status, headers = {}) {
  res.writeHead(status, headers);
  res.end();
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function detectOutputLanguage(prompt = "") {
  return /[\u3400-\u9fff]/u.test(prompt) ? "Simplified Chinese" : "English";
}

function buildPrompt({ photoType, prompt, mode }) {
  const outputLanguage = detectOutputLanguage(prompt);
  const userIdea = prompt?.trim()
    ? `User theme prompt: ${prompt.trim()}`
    : "The user did not provide a theme. Choose a random but practical low-budget self-shoot concept, similar to an I'm Feeling Lucky dice roll.";

  return `You are a practical creative director for non-professional self portraits, couple photos, family photos, and friend-group portraits.
Create a low-budget self-shoot plan for the subject type "${photoType}". ${userIdea}

Core requirements:
- Required output language for all user-facing JSON values: ${outputLanguage}. This is mandatory. If the required output language is Simplified Chinese, write all titles, notes, section text, shopping lists, and shot lists in Simplified Chinese. Keep JSON field names and referenceGroups titles exactly as specified in English regardless of content language.
- Avoid standardized studio-template aesthetics. The plan must work for ordinary homes or accessible locations, phones or entry-level mirrorless cameras, remote shutters, low-cost props, affordable clothing, or clothes the users already own.
- Be concrete, executable, and beginner-friendly. Do not give vague advice.
- ${mode === "lucky" ? "The theme should include a small sense of surprise while remaining easy to execute." : "Respect the user's prompt direction as much as possible."}
- If the user mentions a named film, TV series, novel adaptation, music video, artist, designer, historical period, or fashion era, anchor the plan in identifiable references before generating generic ideas.
- Film and moving-image reference priority: FilmGrab, IMDb media pages, TMDB image metadata, official studio/show pages, BFI, or film archive metadata.
- Fashion and costume reference priority: The Met Costume Institute / The Met Open Access, V&A Fashion Collection, Europeana Fashion.
- Historical everyday-life and real-place reference priority: Library of Congress Prints & Photographs, Europeana, real location photos, documentary photos.
- Lighting, camera setup, composition, and low-budget technique priority: Strobist, ASC / American Cinematographer, Cambridge in Colour, Kodak technical or filmmaker guides.
- Do not invent citations, film stills, fashion item names, brand/model names, or historical facts. If evidence is weak, label the suggestion as approximate and provide safer search keywords.
- Match the selected subject type strictly. If the subject type is "couple", final references, clothing, and pose guidance must fit a two-person romantic couple composition by default, usually one masculine-presenting and one feminine-presenting person unless the user specifies otherwise.
- Final visual references: for named films/TV/novel adaptations/artists/designers, prioritize official/adapted visual material. For named films, prefer stills, promotional stills, posters, and production images. Avoid unrelated landscapes, illustrations, AI art, product images, or solo references when the selected subject requires a couple/family/group.
- Clothing references: cover every required subject. For "couple", provide both masculine and feminine outfit directions, concrete item names, purchase/search keywords, and key accessories. For period themes, use museum/fashion-archive logic for silhouettes, fabrics, accessories, and colors. Do not overfit modern cosplay unless the user asks for party-costume styling.
- Props references: provide historically safer object names, English search keywords, frame use (handheld, tabletop, background, wearable, wall decor, etc.), and anachronism warnings.
- Scene references: prefer real locations, real interiors, film stills, and documentary photos. Do not treat illustrations, concept art, AI images, or product renders as real scene references. If the user says they will shoot at home, translate the scene into a low-budget home setup. If not, provide both real-location options and simplified DIY alternatives.
- Lighting setup: include a simple text diagram: subject position, camera position, key light, fill/reflection, and background distance. Prioritize window light, desk lamps, small LED panels, white walls, foam board, curtain diffusion, paper backdrops, phone tripods, and Bluetooth remotes. Explain why the light fits the theme: hard/soft quality, direction, contrast, shadow edge, and color temperature.
- Post-processing: provide executable steps for Snapseed, Instagram, or native phone editing: crop ratio, exposure, highlights, shadows, warmth, contrast, saturation, grain, vignette, and color direction.
- You do not search for images, return image links, source-page links, or direct image URLs. Image retrieval is handled by the backend.
- Every referenceGroups entry must include a searchQueries array for backend image search. Queries must be concrete and searchable, preferably including named work, era, style, object, location, and subject type. Avoid abstract adjectives alone.
- Every referenceGroups entry must include screeningRules for backend image filtering, such as subject count, couple/family/friends composition, real photography, film stills, clothing silhouette, prop era, and exclusions like illustration/AI/product render.

Return JSON only. Do not return Markdown. The JSON shape must be:
{
  "referenceIntent": "named_work | period | fashion_era | location | generic",
  "theme": "Short theme name",
  "subtitle": "One-sentence mood description that includes the subject type",
  "palette": ["#hex", "#hex", "#hex"],
  "referenceGroups": [
    {
      "title": "Final Visual References",
      "description": "Filtering direction for this reference group",
      "searchQueries": ["English image query 1", "English image query 2", "English image query 3", "English image query 4"],
      "screeningRules": ["Priority rule 1", "Exclusion rule 1"],
      "items": [
        {"title":"Reference title 1","matchStrength":"strong | weak","weakReason":"Weak-reference reason or empty string","searchQuery":"English image search query","keywords":["keyword 1","keyword 2"],"note":"Why it fits this theme"}
      ]
    },
    {
      "title": "Clothing References",
      "description": "Era, silhouette, materials, and styling direction",
      "searchQueries": ["English clothing query 1", "English clothing query 2", "English clothing query 3", "English clothing query 4"],
      "screeningRules": ["Priority rule 1", "Exclusion rule 1"],
      "items": [
        {"title":"Specific clothing or accessory name","forSubject":"masculine subject / feminine subject / person A / person B / everyone","matchStrength":"strong | weak","weakReason":"Weak-reference reason or empty string","searchQuery":"English fashion archive search query","keywords":["specific purchase/search term","classic brand/model only if certain"],"note":"How to recreate it on a low budget"}
      ]
    },
    {
      "title": "Prop References",
      "description": "Hair, accessories, cultural symbols, period objects, and popular products",
      "searchQueries": ["English prop query 1", "English prop query 2", "English prop query 3", "English prop query 4"],
      "screeningRules": ["Priority rule 1", "Exclusion rule 1"],
      "items": [
        {"title":"Specific cultural object or styling element","frameUse":"handheld / tabletop / background / wearable / wall decor","anachronismWarning":"Era-breaking warning or empty string","searchQuery":"English cultural object search query","keywords":["object name","era","search term"],"note":"How to place it in frame"}
      ]
    },
    {
      "title": "Scene References",
      "description": "Indoor/outdoor locations, background, architecture, and environmental mood",
      "searchQueries": ["English scene query 1", "English scene query 2", "English scene query 3", "English scene query 4"],
      "screeningRules": ["Priority rule 1", "Exclusion rule 1"],
      "items": [
        {"title":"Scene title","matchStrength":"strong | weak","weakReason":"Weak-reference reason or empty string","searchQuery":"English location or set design search query","keywords":["location type","background element"],"note":"How to find a similar location or recreate it at home"}
      ]
    }
  ],
  "sections": {
    "Final Visual Direction": ["Point 1", "Point 2", "Point 3"],
    "Clothing": ["Point 1", "Point 2", "Point 3"],
    "Props": ["Point 1", "Point 2", "Point 3"],
    "Shooting Gear": ["Phone/camera tripod, remote, backdrop, floor, reflector, fill light, and other execution advice"],
    "Lighting And Set": ["Must include a text lighting diagram: subject position, camera position, key light, fill/reflection, background distance"],
    "Expressions And Poses": ["Point 1", "Point 2", "Point 3"],
    "Composition": ["Point 1", "Point 2", "Point 3"],
    "Post Processing": ["Must include executable Snapseed / Instagram steps; for film or period imitation, include crop ratio, grain, warmth, contrast, saturation, and vignette direction"]
  },
  "shoppingList": ["Low-cost purchase item 1", "Low-cost purchase item 2", "Low-cost purchase item 3"],
  "shotList": ["Must-shoot frame 1", "Must-shoot frame 2", "Must-shoot frame 3", "Must-shoot frame 4"]
}
Important: referenceGroups must contain exactly the 4 groups above. Each group must contain 4 items.
Do not invent citations. If uncertain, say the reference is approximate and provide safer search keywords.`;
}
function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Model did not return JSON.");
  return JSON.parse(match[0]);
}

async function callModel(payload) {
  const provider = getProviderConfig();
  if (!provider.apiKey) {
    const error = new Error("Missing LLM_API_KEY, ZENMUX_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, or ANTHROPIC_API_KEY. Create a .env file in the project root, or configure environment variables in your deployment platform.");
    error.statusCode = 503;
    throw error;
  }

  if (provider.protocol === "chat") {
    return callChatCompletions(payload, provider);
  }
  if (provider.protocol === "anthropic") {
    return callAnthropicMessages(payload, provider);
  }

  return callResponses(payload, provider);
}

function getProviderConfig() {
  if (process.env.LLM_API_KEY) {
    return getGenericProviderConfig();
  }
  if (process.env.ZENMUX_API_KEY) {
    return {
      name: "zenmux",
      apiKey: process.env.ZENMUX_API_KEY,
      baseUrl: process.env.ZENMUX_BASE_URL || "https://zenmux.ai/api/v1",
      model: process.env.ZENMUX_MODEL || process.env.OPENAI_MODEL || "zenmux/auto",
      protocol: "chat"
    };
  }
  if (process.env.GEMINI_API_KEY) {
    return {
      name: "gemini",
      apiKey: process.env.GEMINI_API_KEY,
      baseUrl: process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai",
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      protocol: "chat"
    };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      name: "anthropic",
      apiKey: process.env.ANTHROPIC_API_KEY,
      baseUrl: process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1",
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929",
      protocol: "anthropic"
    };
  }

  return {
    name: "openai",
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    protocol: "responses"
  };
}

function getGenericProviderConfig() {
  const provider = (process.env.LLM_PROVIDER || "openai-compatible").toLowerCase();
  const protocol = process.env.LLM_PROTOCOL || (provider === "anthropic" || provider === "claude" ? "anthropic" : provider === "openai" ? "responses" : "chat");
  const defaults = getProviderDefaults(provider, protocol);

  return {
    name: provider,
    apiKey: process.env.LLM_API_KEY,
    baseUrl: process.env.LLM_BASE_URL || defaults.baseUrl,
    model: process.env.LLM_MODEL || defaults.model,
    protocol
  };
}

function getProviderDefaults(provider, protocol) {
  if (provider === "zenmux") {
    return { baseUrl: "https://zenmux.ai/api/v1", model: "zenmux/auto" };
  }
  if (provider === "gemini") {
    return { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.5-flash" };
  }
  if (provider === "anthropic" || provider === "claude" || protocol === "anthropic") {
    return { baseUrl: "https://api.anthropic.com/v1", model: "claude-sonnet-4-5-20250929" };
  }
  if (protocol === "chat") {
    return { baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini" };
  }
  return { baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini" };
}

function normalizeInferenceBaseUrl(baseUrl) {
  return baseUrl.replace(/\/+$/, "").replace(/\/management$/, "");
}

async function callChatCompletions(payload, provider) {
  const response = await fetch(`${normalizeInferenceBaseUrl(provider.baseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${provider.apiKey}`
    },
    body: JSON.stringify({
      model: provider.model,
      ...getModelRoutingBody(provider),
      messages: [{ role: "user", content: buildPrompt(payload) }],
      temperature: payload.mode === "lucky" ? 0.95 : 0.7
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`LLM request failed: ${response.status} ${message}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "";
  return extractJson(text);
}

function getModelRoutingBody(provider) {
  if (provider.name !== "zenmux" || provider.model !== "zenmux/auto") return {};

  const availableModels = getZenMuxRoutingModels();
  const modelRoutingConfig = {
    preference: process.env.ZENMUX_ROUTING_PREFERENCE || process.env.LLM_ROUTING_PREFERENCE || "balanced"
  };

  if (availableModels.length > 0) {
    modelRoutingConfig.available_models = availableModels;
  }

  return { model_routing_config: modelRoutingConfig };
}

function getZenMuxRoutingModels() {
  return (process.env.ZENMUX_ROUTING_MODELS || process.env.LLM_ROUTING_MODELS || "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
}

async function callAnthropicMessages(payload, provider) {
  const response = await fetch(`${normalizeInferenceBaseUrl(provider.baseUrl)}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": provider.apiKey,
      "anthropic-version": process.env.ANTHROPIC_VERSION || "2023-06-01"
    },
    body: JSON.stringify({
      model: provider.model,
      max_tokens: Number(process.env.LLM_MAX_TOKENS || process.env.ANTHROPIC_MAX_TOKENS || 1800),
      temperature: payload.mode === "lucky" ? 0.95 : 0.7,
      messages: [{ role: "user", content: buildPrompt(payload) }]
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`LLM request failed: ${response.status} ${message}`);
  }

  const data = await response.json();
  const text = data.content?.map((part) => part.text || "").join("\n") || "";
  return extractJson(text);
}

async function callResponses(payload, provider) {
  const response = await fetch(`${normalizeInferenceBaseUrl(provider.baseUrl)}/responses`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${provider.apiKey}`
    },
    body: JSON.stringify({
      model: provider.model,
      input: buildPrompt(payload),
      temperature: payload.mode === "lucky" ? 0.95 : 0.7
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`LLM request failed: ${response.status} ${message}`);
  }

  const data = await response.json();
  const text = data.output_text
    || data.output?.flatMap((item) => item.content || []).map((part) => part.text || "").join("\n")
    || "";
  return extractJson(text);
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
      sendJson(res, 400, { error: "Enter a theme prompt, or use I\'m Feeling Lucky." });
      return;
    }
    if (imageSearch && !getImageSearchProviderConfig()) {
      sendJson(res, 503, { error: getImageSearchMissingConfigMessage() });
      return;
    }

    const plan = await callModel({ photoType, prompt, mode });
    await hydrateReferenceImages(plan, { imageSearch, photoType, prompt });
    sendJson(res, 200, { plan, generatedAt: new Date().toISOString() });
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

async function hydrateReferenceImages(plan, options = {}) {
  const groups = normalizeReferenceGroups(plan);
  plan.referenceGroups = groups;

  for (const group of groups) {
    group.images = await searchImagesForGroup(group, 4, { ...options, plan });
  }

  plan.references = flattenReferenceGroups(groups);
}

function normalizeReferenceGroups(plan) {
  if (Array.isArray(plan.referenceGroups)) {
    return plan.referenceGroups.map((group) => ({
      title: String(group.title || "Reference"),
      description: String(group.description || ""),
      searchQueries: Array.isArray(group.searchQueries) ? group.searchQueries.map(String).slice(0, 8) : [],
      screeningRules: Array.isArray(group.screeningRules) ? group.screeningRules.map(String).slice(0, 8) : [],
      items: Array.isArray(group.items) ? group.items.slice(0, 4).map(normalizeReferenceItem) : []
    })).filter((group) => group.items.length > 0);
  }

  if (Array.isArray(plan.references)) {
    return plan.references.map((item) => ({
      title: item.title || "Reference",
      description: "",
      items: [normalizeReferenceItem(item)]
    }));
  }

  return [];
}

function normalizeReferenceItem(item) {
  return {
    title: String(item.title || "Reference"),
    forSubject: String(item.forSubject || ""),
    matchStrength: String(item.matchStrength || "strong"),
    weakReason: String(item.weakReason || ""),
    frameUse: String(item.frameUse || ""),
    anachronismWarning: String(item.anachronismWarning || ""),
    searchQuery: String(item.searchQuery || item.prompt || item.title || ""),
    keywords: Array.isArray(item.keywords) ? item.keywords.map(String).slice(0, 6) : [],
    note: String(item.note || item.prompt || "")
  };
}

function flattenReferenceGroups(groups) {
  return groups.map((group) => {
    const first = group.items[0] || {};
    return {
      title: group.title,
      prompt: first.searchQuery || first.note || group.description || "",
      images: group.images || []
    };
  });
}

async function searchImagesForGroup(group, limit = 4, context = {}) {
  const queries = buildProviderImageQueries(group, context);
  if (queries.length > 0) group.searchQueries = queries;
  assignManualSearchQueries(group, queries, context);
  if (!context.imageSearch) return [];
  const provider = getImageSearchProviderConfig();
  if (!provider) return [];
  return searchProviderImagesForGroup(group, limit, provider, context, queries);
}

function getImageSearchProviderConfig() {
  const preferred = (process.env.IMAGE_SEARCH_PROVIDER || "auto").toLowerCase();
  const apiKey = process.env.BRAVE_SEARCH_API_KEY || process.env.BRAVE_API_KEY;
  if ((preferred === "brave" || preferred === "auto") && apiKey) {
    return {
      name: "brave",
      apiKey,
      endpoint: process.env.BRAVE_IMAGE_SEARCH_ENDPOINT || "https://api.search.brave.com/res/v1/images/search"
    };
  }

  return null;
}

function getImageSearchMissingConfigMessage() {
  return "Image search is not configured. Set BRAVE_SEARCH_API_KEY in .env and restart the server.";
}

async function searchProviderImagesForGroup(group, limit, provider, context, availableQueries = []) {
  const queries = (availableQueries.length > 0 ? availableQueries : buildProviderImageQueries(group, context))
    .slice(0, getImageSearchQueryLimit(provider));
  const candidates = [];

  for (const query of queries) {
    const results = await searchImageApi(query, provider, Math.max(limit * 3, 10));
    for (const result of results) {
      candidates.push({ ...result, query });
    }
  }

  return rankAndSelectImages(candidates, group, limit, context);
}

function getImageSearchQueryLimit(provider) {
  const configured = Number(process.env.IMAGE_SEARCH_QUERIES_PER_GROUP || 0);
  if (configured > 0) return Math.min(Math.max(Math.floor(configured), 1), 8);
  return provider.name === "brave" ? 2 : 4;
}

function buildProviderImageQueries(group, context = {}) {
  const baseQueries = buildImageSearchCandidates(group);
  const prompt = String(context.prompt || "");
  const namedWork = inferNamedWork(prompt, context.plan?.referenceIntent);
  const subjectTerms = getSubjectSearchTerms(context.photoType);
  const era = inferEraPrompt(prompt);
  const groupTitle = group.title || "";
  const expanded = [];

  if (namedWork) {
    if (groupTitle === "Final Visual References") {
      expanded.push(
        `${namedWork} couple film still`,
        `${namedWork} Daisy Gatsby still`,
        `${namedWork} promotional still couple`,
        `${namedWork} poster couple`
      );
    } else if (groupTitle === "Clothing References") {
      expanded.push(
        `${namedWork} couple costume`,
        `${namedWork} halloween couple costume`,
        `${namedWork} 1920s couple outfit`,
        `${namedWork} Daisy Gatsby tuxedo dress`
      );
    } else if (groupTitle === "Scene References") {
      expanded.push(
        `${namedWork} mansion party scene`,
        `${namedWork} ballroom interior film still`,
        `${namedWork} art deco interior`,
        `${namedWork} production design`
      );
    } else if (groupTitle === "Prop References") {
      expanded.push(
        `${namedWork} props accessories`,
        `${namedWork} 1920s props`,
        `${namedWork} Daisy Gatsby accessories`,
        `${namedWork} art deco party props`
      );
    }
  }

  for (const query of baseQueries) {
    const normalized = query.trim();
    if (!normalized) continue;
    expanded.push(normalized);
    if (subjectTerms.length > 0 && !containsAny(normalized, subjectTerms)) {
      expanded.push(`${normalized} ${subjectTerms[0]}`);
    }
    if (era && !normalized.toLowerCase().includes(era.toLowerCase())) {
      expanded.push(`${normalized} ${era}`);
    }
  }

  return expanded
    .map(cleanSearchQuery)
    .filter(Boolean)
    .filter((query, index, array) => array.indexOf(query) === index);
}

function inferNamedWork(prompt, referenceIntent = "") {
  const bracketed = prompt.match(/\u300a([^\u300b]+)\u300b/u);
  const raw = bracketed?.[1] || "";
  const text = `${raw} ${prompt}`.toLowerCase();
  if (/gatsby/.test(text)) return "The Great Gatsby";
  if (raw) return raw;
  if (referenceIntent === "named_work") return prompt.replace(/[\u300a\u300b]/gu, "").trim();
  return "";
}

function inferEraPrompt(prompt) {
  const text = String(prompt || "");
  if (/1920|20s/.test(text)) return "1920s";
  if (/1930|30s/.test(text)) return "1930s";
  if (/1940|40s/.test(text)) return "1940s";
  if (/1950|50s/.test(text)) return "1950s";
  if (/1960|60s/.test(text)) return "1960s";
  if (/1970|70s/.test(text)) return "1970s";
  if (/1980|80s/.test(text)) return "1980s";
  if (/1990|90s/.test(text)) return "1990s";
  return "";
}

function getSubjectSearchTerms(photoType = "") {
  if (photoType === "couple") return ["couple", "romantic couple", "man woman", "two people"];
  if (photoType === "family-of-three") return ["family of three", "parents child"];
  if (photoType === "parent-child") return ["parent child"];
  if (photoType === "family") return ["family portrait"];
  if (photoType === "friends" || photoType === "best-friends") return ["friends", "group portrait"];
  if (photoType === "group") return ["group portrait"];
  if (photoType === "solo") return ["portrait"];
  return [];
}

function cleanSearchQuery(query) {
  return String(query || "")
    .replace(/\s+/g, " ")
    .replace(/[\u201c\u201d]/gu, '"')
    .trim();
}

function containsAny(value, terms) {
  const text = value.toLowerCase();
  return terms.some((term) => text.includes(term.toLowerCase()));
}

async function searchImageApi(query, provider, limit) {
  if (!query) return [];
  const cacheKey = `${provider.name}::${query}::${limit}`;
  if (imageApiCache.has(cacheKey)) return imageApiCache.get(cacheKey);

  try {
    const images = await searchBraveImages(query, provider, limit);
    imageApiCache.set(cacheKey, images);
    return images;
  } catch {
    return [];
  }
}

async function searchBraveImages(query, provider, limit) {
  const params = new URLSearchParams({
    q: query,
    count: String(Math.min(Math.max(Number(process.env.BRAVE_IMAGE_SEARCH_COUNT || limit * 5), limit), 50)),
    safesearch: process.env.BRAVE_SAFESEARCH || "strict",
    spellcheck: process.env.BRAVE_SPELLCHECK || "1"
  });
  if (process.env.BRAVE_SEARCH_COUNTRY) {
    params.set("country", process.env.BRAVE_SEARCH_COUNTRY);
  }
  if (process.env.BRAVE_SEARCH_LANG) {
    params.set("search_lang", process.env.BRAVE_SEARCH_LANG);
  }

  const response = await fetch(`${provider.endpoint}?${params}`, {
    headers: {
      accept: "application/json",
      "X-Subscription-Token": provider.apiKey
    }
  });
  if (!response.ok) return [];
  const data = await response.json();
  return (data.results || []).map((item) => normalizeImageCandidate({
    title: item.title,
    imageUrl: item.properties?.url || item.thumbnail?.src,
    thumbUrl: item.thumbnail?.src || item.properties?.url,
    pageUrl: item.url,
    sourceName: item.source || item.meta_url?.hostname || item.meta_url?.netloc,
    width: item.properties?.width,
    height: item.properties?.height,
    confidence: item.confidence
  })).filter(Boolean);
}

function normalizeImageCandidate(candidate) {
  const imageUrl = String(candidate.imageUrl || "");
  const thumbUrl = String(candidate.thumbUrl || imageUrl);
  const pageUrl = String(candidate.pageUrl || imageUrl);
  if (!imageUrl && !thumbUrl && !pageUrl) return null;
  return {
    title: String(candidate.title || "Reference image"),
    thumbUrl,
    imageUrl,
    pageUrl,
    sourceName: String(candidate.sourceName || ""),
    width: Number(candidate.width || 0),
    height: Number(candidate.height || 0),
    confidence: String(candidate.confidence || "")
  };
}

function rankAndSelectImages(candidates, group, limit, context = {}) {
  const seen = new Set();
  return candidates
    .map((candidate) => scoreImageCandidate(candidate, group, context))
    .filter((candidate) => {
      const key = normalizeImageKey(candidate.imageUrl || candidate.thumbUrl || candidate.pageUrl);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return candidate.score > 0;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((candidate) => ({
      title: candidate.title,
      thumbUrl: candidate.thumbUrl,
      imageUrl: candidate.imageUrl,
      pageUrl: candidate.pageUrl,
      license: candidate.sourceName || "",
      author: "",
      query: candidate.query,
      note: candidate.note || "",
      matchStrength: candidate.score >= 7 ? "strong" : "weak",
      weakReason: candidate.score >= 7 ? "" : "This image only partially matches the subject or theme. Treat it as a weak reference."
    }));
}

function scoreImageCandidate(candidate, group, context = {}) {
  const candidateText = [
    candidate.title,
    candidate.sourceName,
    candidate.pageUrl,
    candidate.imageUrl
  ].join(" ").toLowerCase();
  const text = [
    candidateText,
    candidate.query,
    ...(Array.isArray(group.screeningRules) ? group.screeningRules : [])
  ].join(" ").toLowerCase();
  const groupTitle = group.title || "";
  const subjectTerms = getSubjectSearchTerms(context.photoType).map((term) => term.toLowerCase());
  const prompt = String(context.prompt || "").toLowerCase();
  let score = 0;

  if (candidate.width >= 700 && candidate.height >= 700) score += 3;
  else if (candidate.width >= 450 && candidate.height >= 450) score += 1;
  if (candidate.confidence === "high") score += 2;
  if (candidate.confidence === "low") score -= 2;
  if (candidate.width && candidate.height) {
    const ratio = candidate.width / candidate.height;
    if (ratio >= 0.55 && ratio <= 1.9) score += 2;
    if (ratio < 0.35 || ratio > 3) score -= 4;
  }

  if (containsAny(text, ["filmgrab", "imdb.com/title", "tmdb", "themoviedb", "bfi.org"])) score += 5;
  if (containsAny(text, ["metmuseum", "vam.ac.uk", "europeana", "loc.gov"])) score += 4;
  if (containsAny(text, ["official", "studio", "paramount", "warner", "production still", "promotional still"])) score += 3;

  if (containsAny(text, ["illustration", "drawing", "clipart", "vector", "render", "ai-generated", "ai art", "wallpaper", "logo", "pngtree", "freepik"])) score -= 6;
  if (containsAny(text, ["stock photo", "shutterstock", "istock", "alamy"])) score -= 1;

  if (subjectTerms.length > 0 && containsAny(text, subjectTerms)) score += 4;
  if (context.photoType === "couple") {
    if (containsAny(text, ["couple", "romantic", "daisy", "gatsby", "man woman", "bride groom", "two people", "pair"])) score += 5;
    if (containsAny(text, ["solo", "single portrait", "headshot"])) score -= groupTitle === "Clothing References" ? 1 : 5;
  }

  if (groupTitle === "Final Visual References" && containsAny(text, ["film still", "movie still", "promotional still", "poster", "scene", "couple"])) score += 4;
  if (groupTitle === "Clothing References" && containsAny(text, ["costume", "fashion", "outfit", "dress", "tuxedo", "suit", "accessories"])) score += 4;
  if (groupTitle === "Scene References" && containsAny(text, ["interior", "location", "ballroom", "mansion", "party", "set", "scene", "hotel"])) score += 4;
  if (groupTitle === "Prop References" && containsAny(text, ["prop", "accessory", "accessories", "object", "vintage", "antique", "jewelry", "glass", "holder", "walkman", "period"])) score += 4;

  if (/gatsby/.test(prompt)) {
    if (containsAny(candidateText, ["gatsby", "daisy", "roaring twenties", "1920s", "art deco"])) score += 6;
    else score -= groupTitle === "Final Visual References" ? 14 : 3;
  }
  if (prompt.includes("1920")) {
    if (containsAny(candidateText, ["1920", "roaring twenties", "flapper", "art deco"])) score += 4;
    else if (groupTitle !== "Scene References") score -= 3;
  }

  return { ...candidate, score };
}

function normalizeImageKey(value = "") {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname}`.toLowerCase().replace(/\/+$/, "");
  } catch {
    return value.toLowerCase();
  }
}

function assignManualSearchQueries(group, groupQueries, context = {}) {
  const items = Array.isArray(group.items) ? group.items : [];
  if (items.length === 0) return;

  const groupTitle = group.title || "";
  const perItemLimit = getManualQueryLimit(groupTitle);
  const prompt = String(context.prompt || "");
  const promptTokens = queryTokens(prompt);
  const subjectTerms = getSubjectSearchTerms(context.photoType);
  const namedWork = inferNamedWork(prompt, context.plan?.referenceIntent);
  const sharedQueries = Array.isArray(groupQueries) ? groupQueries : [];

  for (const item of items) {
    const baseText = [
      item.title,
      item.forSubject,
      item.searchQuery,
      item.note,
      ...(Array.isArray(item.keywords) ? item.keywords : [])
    ].join(" ");
    const itemTokens = queryTokens(baseText);
    const scored = [];

    addManualQueryCandidate(scored, item.searchQuery, 12, itemTokens, promptTokens, subjectTerms, namedWork, groupTitle);
    if (Array.isArray(item.keywords) && item.keywords.length > 0) {
      addManualQueryCandidate(scored, item.keywords.join(" "), 5, itemTokens, promptTokens, subjectTerms, namedWork, groupTitle);
    }
    for (const query of sharedQueries) {
      addManualQueryCandidate(scored, query, 0, itemTokens, promptTokens, subjectTerms, namedWork, groupTitle);
    }

    const minScore = groupTitle === "Prop References" ? 10 : groupTitle === "Scene References" ? 8 : 6;
    item.manualSearchQueries = scored
      .filter((entry) => entry.score >= minScore)
      .sort((a, b) => b.score - a.score || a.query.length - b.query.length)
      .map((entry) => entry.query)
      .filter((query, index, array) => array.indexOf(query) === index)
      .slice(0, perItemLimit);
  }
}

function addManualQueryCandidate(target, query, baseScore, itemTokens, promptTokens, subjectTerms, namedWork, groupTitle) {
  const cleaned = cleanSearchQuery(query);
  if (!cleaned) return;
  const tokens = queryTokens(cleaned);
  let score = baseScore;
  score += overlapCount(tokens, itemTokens) * 3;
  score += overlapCount(tokens, promptTokens) * 2;
  if (namedWork && cleaned.toLowerCase().includes(namedWork.toLowerCase())) score += 5;
  if (subjectTerms.length > 0 && containsAny(cleaned, subjectTerms)) score += 3;
  if (groupTitle === "Final Visual References" && containsAny(cleaned, ["still", "poster", "scene", "couple", "portrait"])) score += 3;
  if (groupTitle === "Clothing References" && containsAny(cleaned, ["costume", "outfit", "fashion", "dress", "suit", "accessories"])) score += 3;
  if (groupTitle === "Prop References" && containsAny(cleaned, ["prop", "props", "glass", "holder", "accessory", "accessories", "vintage", "period", "jewelry"])) score += 3;
  if (groupTitle === "Scene References" && containsAny(cleaned, ["interior", "location", "scene", "mansion", "ballroom", "set", "room"])) score += 3;
  if (groupTitle === "Prop References" && tokens.length <= 2 && !containsAny(cleaned, ["1920", "vintage", "gatsby", "art deco"])) score -= 4;
  if (groupTitle === "Scene References" && tokens.length <= 2) score -= 5;
  target.push({ query: cleaned, score });
}

function getManualQueryLimit(groupTitle) {
  if (groupTitle === "Prop References") return 1;
  if (groupTitle === "Scene References") return 1;
  return 5;
}

function queryTokens(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u3400-\u9fff]+/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !IMAGE_QUERY_STOP_WORDS.has(token));
}

function overlapCount(a, b) {
  const set = new Set(b);
  return a.reduce((count, token) => count + (set.has(token) ? 1 : 0), 0);
}

const IMAGE_QUERY_STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "into", "style", "image", "images", "reference", "references",
  "photo", "photos", "photography", "search", "query", "person", "people", "everyone"
]);

function buildImageSearchCandidates(group) {
  const values = [];
  if (Array.isArray(group.searchQueries)) values.push(...group.searchQueries);
  for (const item of group.items || []) {
    values.push(item.searchQuery, item.title);
    if (Array.isArray(item.keywords)) values.push(item.keywords.join(" "));
  }
  values.push(group.description, group.title);
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index);
}

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
