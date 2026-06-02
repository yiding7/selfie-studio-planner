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

export { sendJson, sendEmpty, readBody };
