const imageApiCache = new Map();

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

export { getImageSearchProviderConfig, getImageSearchMissingConfigMessage, searchImageApi };
