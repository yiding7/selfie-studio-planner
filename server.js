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

const photoTypes = new Set(["单人", "情侣", "三口之家", "亲子", "全家福", "好友", "闺蜜", "多人合照"]);
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

function buildPrompt({ photoType, prompt, mode }) {
  const userIdea = prompt?.trim()
    ? `用户自己的主题想法：${prompt.trim()}`
    : "用户没有提供主题，请像“试试手气”一样随机选择一个适合低预算、自助拍摄的主题。";

  return `你是一个懂手机摄影、低预算布景、情侣/家庭纪念照策划的创意导演。
请为「${photoType}」生成一套自拍或自助拍摄方案。${userIdea}
生成要求：
- 输出语言必须使用简体中文。即使用户 prompt 是英文，也必须用简体中文回答。
- 不要影楼模板感，要适合普通家庭、手机、手机遥控器、少量道具、便宜服装或自有衣服。
- 具体、可执行、不要空泛。
- ${mode === "lucky" ? "主题需要带一点随机惊喜，但仍然容易执行。" : "尽量尊重用户 prompt 的主题方向。"}
- 如果用户提到具名电影、电视剧、小说改编、音乐视频、艺术家、设计师、历史时期或服装年代，必须先把建议锚定到可识别参考，再生成通用方案。
- 影视参考优先：FilmGrab、IMDb media pages、TMDB image metadata、官方片方/剧集页面、BFI 或电影档案元数据。
- 服装/造型参考优先：The Met Costume Institute / The Met Open Access、V&A Fashion Collection、Europeana Fashion。
- 历史日常与真实场景优先：Library of Congress Prints & Photographs、Europeana、真实地点照片、纪录照片。
- 布光、相机设置、构图和低预算拍摄建议优先：Strobist、ASC / American Cinematographer、Cambridge in Colour、Kodak technical / filmmaker guides。
- 不要编造引用、剧照、服装名、品牌款式或历史事实。证据弱时必须说明“近似参考”，并给更安全的搜索关键词。
- 必须严格匹配用户选择的拍摄主体。选择“情侣”时，成品参考、服装参考和姿势建议必须优先适合情侣双人构图，默认一男一女或明确 romantic pair / two people，除非用户指定其他性别构成。
- 成品参考：如果 prompt 提到具名电影/剧/小说改编/艺术家/设计师，优先该作品及官方/影视化视觉材料；具名电影优先剧照、宣传照、海报、production images，不要用无关风景、插画、AI 图、产品图或单人图替代情侣/家庭/群像参考。
- 服装参考：必须覆盖每个必要主体。情侣默认同时提供男性与女性 outfit directions、具体 item names、可购买/搜索关键词、关键配饰。历史或年代主题要尽量用博物馆/服装档案校验廓形、面料、配饰和色彩；不要过度现代 cosplay 化，除非用户要求 party costume。
- 道具参考：必须给历史上更稳妥的物件名称、英文/中文搜索关键词、入镜方式（手持、桌面、背景、佩戴、墙面装饰等），并提醒会穿帮的时代错误物品。
- 场景参考：优先真实地点、真实室内、影视剧照、纪录照片；不要把插画、概念图、AI 图、产品渲染当作真实场景。若用户说“在家拍摄”，把场景翻译成低预算家中布景；若没说在家，同时给真实地点选项和 DIY 简化替代。
- 布光布景：必须给文字版简单灯位图：人物位置、相机位置、主光、补光/反光、背景距离。优先窗光、台灯、LED 小灯、白墙、泡沫板、窗帘柔光、纯色背景纸、手机三脚架、蓝牙遥控。解释为什么光线适合主题：硬/软、方向、反差、阴影边缘、色温。
- 后期处理：必须给 Snapseed / Instagram / 手机原生编辑可执行步骤：裁切比例、曝光、高光、阴影、暖色、对比度、饱和度、颗粒、暗角、色彩方向。
- 你不负责搜索或返回图片链接、来源页链接或任何图片直链。图片检索由后端独立完成。
- 你必须为 4 个 referenceGroups 分别提供 searchQueries 数组，供后端图片搜索使用。searchQueries 必须具体、可检索，优先包含作品名/年代/风格/物品名/地点/主体类型，不要写抽象形容词。
- 每个 referenceGroups 必须提供 screeningRules 数组，描述后端筛选图片时应优先/排除什么：例如主体人数、男女/家庭/好友构成、真实摄影、电影剧照、服装廓形、道具年代、排除插画/AI/产品渲染等。
只返回 JSON，不要 Markdown。字段结构必须是：
{
  "referenceIntent": "named_work | period | fashion_era | location | generic",
  "theme": "短主题名",
  "subtitle": "一句话氛围描述，包含拍摄主体",
  "palette": ["#hex", "#hex", "#hex"],
  "referenceGroups": [
    {
      "title": "成品参考",
      "description": "该组参考的筛选方向",
      "searchQueries": ["English image query 1", "English image query 2", "English image query 3", "English image query 4"],
      "screeningRules": ["优先规则1", "排除规则1"],
      "items": [
        {"title":"参考标题1","matchStrength":"strong | weak","weakReason":"弱参考原因或空字符串","searchQuery":"English image search query","keywords":["关键词1","关键词2"],"note":"为什么适合这个主题"}
      ]
    },
    {
      "title": "服装参考",
      "description": "服装时代、廓形、材质和搭配方向",
      "searchQueries": ["English clothing query 1", "English clothing query 2", "English clothing query 3", "English clothing query 4"],
      "screeningRules": ["优先规则1", "排除规则1"],
      "items": [
        {"title":"具体服装或饰品名","forSubject":"男性/女性/人物A/人物B/全体","matchStrength":"strong | weak","weakReason":"弱参考原因或空字符串","searchQuery":"English fashion archive search query","keywords":["可购买或搜索的具体名称","经典品牌/款式如有把握才写"],"note":"如何低成本复刻"}
      ]
    },
    {
      "title": "道具参考",
      "description": "发型、配饰、文化符号、时代产品和流行物件",
      "searchQueries": ["English prop query 1", "English prop query 2", "English prop query 3", "English prop query 4"],
      "screeningRules": ["优先规则1", "排除规则1"],
      "items": [
        {"title":"具体文化物件或造型","frameUse":"手持/桌面/背景/佩戴/墙面装饰","anachronismWarning":"会穿帮的物品提醒或空字符串","searchQuery":"English cultural object search query","keywords":["物品名","年代","搜索词"],"note":"如何入镜"}
      ]
    },
    {
      "title": "场景参考",
      "description": "室内/室外地点、背景、建筑、环境氛围",
      "searchQueries": ["English scene query 1", "English scene query 2", "English scene query 3", "English scene query 4"],
      "screeningRules": ["优先规则1", "排除规则1"],
      "items": [
        {"title":"场景标题","matchStrength":"strong | weak","weakReason":"弱参考原因或空字符串","searchQuery":"English location or set design search query","keywords":["地点类型","背景元素"],"note":"怎样找相似地点或在家低成本复刻"}
      ]
    }
  ],
  "sections": {
    "成品参考": ["要点1", "要点2", "要点3"],
    "服装": ["要点1", "要点2", "要点3"],
    "道具": ["要点1", "要点2", "要点3"],
    "拍摄道具": ["手机/相机支架、遥控器、背景、地面、反光板、补光灯等执行建议"],
    "布光布景": ["必须包含文字灯位图：人物位置、相机位置、主光、补光/反光、背景距离"],
    "表情姿势": ["要点1", "要点2", "要点3"],
    "构图": ["要点1", "要点2", "要点3"],
    "后期处理": ["必须给 Snapseed / Instagram 可执行步骤；如模仿电影或年代风格，说明裁切比例、颗粒、色温、对比度、饱和度、暗角方向"]
  },
  "shoppingList": ["低成本采购项1", "低成本采购项2", "低成本采购项3"],
  "shotList": ["必拍镜头1", "必拍镜头2", "必拍镜头3", "必拍镜头4"]
}
注意：referenceGroups 必须严格包含上述 4 组；每组 items 必须给 4 条。
不要编造 citation；如果不确定，写“近似参考”，并提供搜索关键词。`;
}

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Model did not return JSON.");
  return JSON.parse(match[0]);
}

async function callModel(payload) {
  const provider = getProviderConfig();
  if (!provider.apiKey) {
    const error = new Error("缺少 LLM_API_KEY、ZENMUX_API_KEY、OPENAI_API_KEY、GEMINI_API_KEY 或 ANTHROPIC_API_KEY。请在项目根目录创建 .env 文件，或在部署平台配置环境变量。");
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
      sendJson(res, 400, { error: "请选择有效的拍摄主体。" });
      return;
    }
    if (mode === "prompt" && !prompt.trim()) {
      sendJson(res, 400, { error: "请输入主题 prompt，或改用试试手气。" });
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
    sendJson(res, error.statusCode || 500, { error: error.message || "生成失败，请稍后重试。" });
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
      title: String(group.title || "参考"),
      description: String(group.description || ""),
      searchQueries: Array.isArray(group.searchQueries) ? group.searchQueries.map(String).slice(0, 8) : [],
      screeningRules: Array.isArray(group.screeningRules) ? group.screeningRules.map(String).slice(0, 8) : [],
      items: Array.isArray(group.items) ? group.items.slice(0, 4).map(normalizeReferenceItem) : []
    })).filter((group) => group.items.length > 0);
  }

  if (Array.isArray(plan.references)) {
    return plan.references.map((item) => ({
      title: item.title || "参考",
      description: "",
      items: [normalizeReferenceItem(item)]
    }));
  }

  return [];
}

function normalizeReferenceItem(item) {
  return {
    title: String(item.title || "参考"),
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
  if (!context.imageSearch) return [];
  const provider = getImageSearchProviderConfig();
  if (!provider) return [];
  return searchProviderImagesForGroup(group, limit, provider, context);
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
  return "未配置图片搜索 API。请在 .env 设置 BRAVE_SEARCH_API_KEY 后重启服务。";
}

async function searchProviderImagesForGroup(group, limit, provider, context) {
  const queries = buildProviderImageQueries(group, context).slice(0, getImageSearchQueryLimit(provider));
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
    if (groupTitle === "成品参考") {
      expanded.push(
        `${namedWork} couple film still`,
        `${namedWork} Daisy Gatsby still`,
        `${namedWork} promotional still couple`,
        `${namedWork} poster couple`
      );
    } else if (groupTitle === "服装参考") {
      expanded.push(
        `${namedWork} couple costume`,
        `${namedWork} halloween couple costume`,
        `${namedWork} 1920s couple outfit`,
        `${namedWork} Daisy Gatsby tuxedo dress`
      );
    } else if (groupTitle === "场景参考") {
      expanded.push(
        `${namedWork} mansion party scene`,
        `${namedWork} ballroom interior film still`,
        `${namedWork} art deco interior`,
        `${namedWork} production design`
      );
    } else if (groupTitle === "道具参考") {
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
  const bracketed = prompt.match(/《([^》]+)》/);
  const raw = bracketed?.[1] || "";
  const text = `${raw} ${prompt}`.toLowerCase();
  if (/gatsby|盖茨比/.test(text)) return "The Great Gatsby";
  if (raw) return raw;
  if (referenceIntent === "named_work") return prompt.replace(/[《》]/g, "").trim();
  return "";
}

function inferEraPrompt(prompt) {
  const text = String(prompt || "");
  if (/1920|20s|二十年代|20 年代/.test(text)) return "1920s";
  if (/1930|30s|三十年代|30 年代/.test(text)) return "1930s";
  if (/1940|40s|四十年代|40 年代/.test(text)) return "1940s";
  if (/1950|50s|五十年代|50 年代/.test(text)) return "1950s";
  if (/1960|60s|六十年代|60 年代/.test(text)) return "1960s";
  if (/1970|70s|七十年代|70 年代/.test(text)) return "1970s";
  if (/1980|80s|八十年代|80 年代/.test(text)) return "1980s";
  if (/1990|90s|九十年代|90 年代/.test(text)) return "1990s";
  return "";
}

function getSubjectSearchTerms(photoType = "") {
  if (photoType === "情侣") return ["couple", "romantic couple", "man woman", "two people"];
  if (photoType === "三口之家") return ["family of three", "parents child"];
  if (photoType === "亲子") return ["parent child"];
  if (photoType === "全家福") return ["family portrait"];
  if (photoType === "好友" || photoType === "闺蜜") return ["friends", "group portrait"];
  if (photoType === "多人合照") return ["group portrait"];
  if (photoType === "单人") return ["portrait"];
  return [];
}

function cleanSearchQuery(query) {
  return String(query || "")
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, '"')
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
    title: String(candidate.title || "参考图"),
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
      return candidate.score > -10;
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
      weakReason: candidate.score >= 7 ? "" : "图片搜索结果与主体或主题只部分匹配，请作为弱参考使用。"
    }));
}

function scoreImageCandidate(candidate, group, context = {}) {
  const text = [
    candidate.title,
    candidate.sourceName,
    candidate.pageUrl,
    candidate.imageUrl,
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
  if (context.photoType === "情侣") {
    if (containsAny(text, ["couple", "romantic", "daisy", "gatsby", "man woman", "bride groom", "two people", "pair"])) score += 5;
    if (containsAny(text, ["solo", "single portrait", "headshot"])) score -= groupTitle === "服装参考" ? 1 : 5;
  }

  if (groupTitle === "成品参考" && containsAny(text, ["film still", "movie still", "promotional still", "poster", "scene", "couple"])) score += 4;
  if (groupTitle === "服装参考" && containsAny(text, ["costume", "fashion", "outfit", "dress", "tuxedo", "suit", "accessories"])) score += 4;
  if (groupTitle === "场景参考" && containsAny(text, ["interior", "location", "ballroom", "mansion", "party", "set", "scene", "hotel"])) score += 4;
  if (groupTitle === "道具参考" && containsAny(text, ["prop", "accessory", "accessories", "object", "vintage", "antique", "jewelry", "glass", "holder", "walkman", "period"])) score += 4;

  if (/gatsby|盖茨比/.test(prompt) && containsAny(text, ["gatsby", "daisy", "roaring twenties", "1920s", "art deco"])) score += 5;
  if (prompt.includes("1920") && containsAny(text, ["1920", "roaring twenties", "flapper", "art deco"])) score += 3;

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
  console.log(`Photo Inspiration is running at http://127.0.0.1:${port}`);
});
