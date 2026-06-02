import { getImageSearchProviderConfig, searchImageApi } from "./provider.js";
import { assignManualSearchQueries, buildProviderImageQueries } from "./queries.js";
import { rankAndSelectImages } from "./scoring.js";

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

export { hydrateReferenceImages };
