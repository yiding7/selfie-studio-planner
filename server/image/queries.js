function buildProviderImageQueries(group, context = {}) {
  const baseQueries = buildImageSearchCandidates(group);
  const prompt = String(context.prompt || "");
  const namedWork = inferNamedWork(prompt, context.plan?.referenceIntent);
  const subjectTerms = getSubjectSearchTerms(context.photoType);
  const subjectLabel = subjectTerms[0] || "portrait";
  const era = inferEraPrompt(prompt);
  const groupTitle = group.title || "";
  const expanded = [];

  if (namedWork) {
    if (groupTitle === "Final Visual References") {
      expanded.push(
        `${namedWork} ${subjectLabel} scene`,
        `${namedWork} ${subjectLabel} still`,
        `${namedWork} cast ${subjectLabel}`,
        `${namedWork} poster ${subjectLabel}`
      );
    } else if (groupTitle === "Clothing References") {
      expanded.push(
        `${namedWork} ${subjectLabel} costume`,
        `${namedWork} character outfits ${subjectLabel}`,
        `${namedWork} cosplay ${subjectLabel}`,
        `${namedWork} wardrobe ${subjectLabel}`
      );
    } else if (groupTitle === "Scene References") {
      expanded.push(
        `${namedWork} interior scene`,
        `${namedWork} setting location`,
        `${namedWork} background scene`,
        `${namedWork} production design`
      );
    } else if (groupTitle === "Prop References") {
      expanded.push(
        `${namedWork} props accessories`,
        `${namedWork} objects props`,
        `${namedWork} character accessories`,
        `${namedWork} set dressing props`
      );
    }
  }

  const expandedBaseQueries = [];
  for (const query of baseQueries) {
    const normalized = query.trim();
    if (!normalized) continue;
    expandedBaseQueries.push(normalized);
    if (subjectTerms.length > 0 && !containsAny(normalized, subjectTerms)) {
      expandedBaseQueries.push(`${normalized} ${subjectTerms[0]}`);
    }
    if (era && !normalized.toLowerCase().includes(era.toLowerCase())) {
      expandedBaseQueries.push(`${normalized} ${era}`);
    }
  }

  const orderedQueries = groupTitle === "Prop References" || groupTitle === "Scene References"
    ? [...expandedBaseQueries, ...expanded]
    : [...expanded, ...expandedBaseQueries];

  return orderedQueries
    .map(cleanSearchQuery)
    .filter(Boolean)
    .filter((query, index, array) => array.indexOf(query) === index);
}

function inferNamedWork(prompt, referenceIntent = "") {
  const bracketed = prompt.match(/\u300a([^\u300b]+)\u300b/u);
  const raw = bracketed?.[1] || "";
  const text = `${raw} ${prompt}`.toLowerCase();
  if (/gatsby/.test(text)) return "The Great Gatsby";
  if (/family\s*guy|\u6076\u641e\u4e4b\u5bb6/.test(text)) return "Family Guy";
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
  return getSubjectProfile(photoType).terms;
}

function getSubjectProfile(photoType = "") {
  const profiles = {
    solo: {
      terms: ["solo portrait", "single person", "portrait"],
      positive: ["solo", "single person", "portrait", "headshot"],
      mismatch: ["couple", "family", "group", "friends"]
    },
    couple: {
      terms: ["couple", "romantic couple", "man woman", "two people"],
      positive: ["couple", "romantic", "man woman", "two people", "pair", "bride groom"],
      mismatch: ["family of three", "family portrait", "group", "friends", "solo"]
    },
    "family-of-three": {
      terms: ["family of three", "parents child", "three person family", "mother father child"],
      positive: ["family of three", "parents child", "mother father child", "mom dad child", "three people", "family"],
      mismatch: ["couple", "romantic", "bride groom", "wedding", "solo", "single portrait"]
    },
    "parent-child": {
      terms: ["parent child", "mother child", "father child"],
      positive: ["parent child", "mother child", "father child", "family"],
      mismatch: ["couple", "romantic", "bride groom", "wedding", "solo"]
    },
    family: {
      terms: ["family portrait", "family group"],
      positive: ["family", "family portrait", "parents", "children"],
      mismatch: ["couple", "romantic", "bride groom", "solo"]
    },
    friends: {
      terms: ["friends", "friend group", "group portrait"],
      positive: ["friends", "friend group", "group portrait", "group"],
      mismatch: ["couple", "romantic", "family", "solo"]
    },
    "best-friends": {
      terms: ["best friends", "two friends", "friend portrait"],
      positive: ["best friends", "friends", "two friends", "friend portrait"],
      mismatch: ["romantic couple", "bride groom", "family", "solo"]
    },
    group: {
      terms: ["group portrait", "group photo"],
      positive: ["group", "group portrait", "group photo"],
      mismatch: ["couple", "romantic", "solo"]
    }
  };
  return profiles[photoType] || { terms: [], positive: [], mismatch: [] };
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

export {
  assignManualSearchQueries,
  buildProviderImageQueries,
  cleanSearchQuery,
  containsAny,
  getSubjectProfile,
  getSubjectSearchTerms,
  inferNamedWork,
  queryTokens
};
