import { buildPrompt, extractJson } from "./prompt.js";
import { buildResearchPrompt, extractResearchJson } from "./research.js";

async function callModel(payload) {
  const provider = getProviderConfig();
  if (!provider.apiKey) {
    const error = new Error("Missing LLM_API_KEY, ZENMUX_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, or ANTHROPIC_API_KEY. Create a .env file in the project root, or configure environment variables in your deployment platform.");
    error.statusCode = 503;
    throw error;
  }
  const temperature = payload.mode === "lucky" ? 0.95 : 0.7;
  const maxTokens = Number(process.env.LLM_MAX_TOKENS || process.env.ANTHROPIC_MAX_TOKENS || 1800);
  const text = await callLLMText(buildPrompt(payload), { temperature, maxTokens, provider });
  return extractJson(text);
}

async function callResearchAgent({ photoType, prompt }) {
  const provider = getProviderConfig();
  if (!provider.apiKey) return {};
  try {
    const text = await callLLMText(buildResearchPrompt({ photoType, prompt }), {
      temperature: 0.3,
      maxTokens: 900,
      provider
    });
    return extractResearchJson(text);
  } catch {
    return {};
  }
}

async function callLLMText(promptText, { temperature = 0.7, maxTokens, provider } = {}) {
  const p = provider || getProviderConfig();
  if (p.protocol === "chat") return callChatText(promptText, temperature, p);
  if (p.protocol === "anthropic") return callAnthropicText(promptText, temperature, maxTokens, p);
  return callResponsesText(promptText, temperature, p);
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
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
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
    return { baseUrl: "https://api.anthropic.com/v1", model: "claude-sonnet-4-6" };
  }
  if (protocol === "chat") {
    return { baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini" };
  }
  return { baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini" };
}

function normalizeInferenceBaseUrl(baseUrl) {
  return baseUrl.replace(/\/+$/, "").replace(/\/management$/, "");
}

async function callChatText(promptText, temperature, provider) {
  const response = await fetch(`${normalizeInferenceBaseUrl(provider.baseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${provider.apiKey}`
    },
    body: JSON.stringify({
      model: provider.model,
      ...getModelRoutingBody(provider),
      messages: [{ role: "user", content: promptText }],
      temperature
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`LLM request failed: ${response.status} ${message}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
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

async function callAnthropicText(promptText, temperature, maxTokens, provider) {
  const response = await fetch(`${normalizeInferenceBaseUrl(provider.baseUrl)}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": provider.apiKey,
      "anthropic-version": process.env.ANTHROPIC_VERSION || "2023-06-01"
    },
    body: JSON.stringify({
      model: provider.model,
      max_tokens: maxTokens || Number(process.env.LLM_MAX_TOKENS || process.env.ANTHROPIC_MAX_TOKENS || 1800),
      temperature,
      messages: [{ role: "user", content: promptText }]
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`LLM request failed: ${response.status} ${message}`);
  }

  const data = await response.json();
  return data.content?.map((part) => part.text || "").join("\n") || "";
}

async function callResponsesText(promptText, temperature, provider) {
  const response = await fetch(`${normalizeInferenceBaseUrl(provider.baseUrl)}/responses`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${provider.apiKey}`
    },
    body: JSON.stringify({
      model: provider.model,
      input: promptText,
      temperature
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`LLM request failed: ${response.status} ${message}`);
  }

  const data = await response.json();
  return data.output_text
    || data.output?.flatMap((item) => item.content || []).map((part) => part.text || "").join("\n")
    || "";
}

export { callModel, callResearchAgent, callLLMText, getProviderConfig };
