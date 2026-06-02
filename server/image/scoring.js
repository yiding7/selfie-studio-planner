import { containsAny, getSubjectProfile, inferNamedWork, queryTokens } from "./queries.js";

function rankAndSelectImages(candidates, group, limit, context = {}) {
  const seen = new Set();
  return candidates
    .map((candidate) => scoreImageCandidate(candidate, group, context))
    .filter((candidate) => {
      const key = normalizeImageKey(candidate.imageUrl || candidate.thumbUrl || candidate.pageUrl);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return candidate.score >= getImageDisplayThreshold(group, context);
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

function getImageDisplayThreshold(group, context = {}) {
  const namedWork = inferNamedWork(context.prompt || "", context.plan?.referenceIntent);
  const groupTitle = group.title || "";
  if (namedWork && (groupTitle === "Final Visual References" || groupTitle === "Clothing References")) return 8;
  if (namedWork) return 5;
  return 3;
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
  const subjectProfile = getSubjectProfile(context.photoType);
  const subjectTerms = subjectProfile.terms.map((term) => term.toLowerCase());
  const namedWork = inferNamedWork(context.prompt || "", context.plan?.referenceIntent);
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
  if (subjectProfile.positive.length > 0 && containsAny(text, subjectProfile.positive)) score += 5;
  if (subjectProfile.mismatch.length > 0 && containsAny(candidateText, subjectProfile.mismatch)) {
    score -= groupTitle === "Clothing References" ? 5 : 10;
  }
  if (namedWork) {
    if (matchesNamedWork(candidateText, namedWork)) score += 8;
    else score -= groupTitle === "Final Visual References" || groupTitle === "Clothing References" ? 12 : 5;
  }

  if (groupTitle === "Final Visual References" && containsAny(text, ["film still", "movie still", "promotional still", "poster", "scene", "cast", "portrait"])) score += 4;
  if (groupTitle === "Clothing References" && containsAny(text, ["costume", "fashion", "outfit", "dress", "tuxedo", "suit", "accessories"])) score += 4;
  if (groupTitle === "Scene References" && containsAny(text, ["interior", "location", "ballroom", "mansion", "party", "set", "scene", "hotel"])) score += 4;
  if (groupTitle === "Prop References" && containsAny(text, ["prop", "accessory", "accessories", "object", "vintage", "antique", "jewelry", "glass", "holder", "walkman", "period"])) score += 4;

  if (/gatsby/.test(prompt)) {
    if (containsAny(candidateText, ["gatsby", "daisy", "roaring twenties", "1920s", "art deco"])) score += 6;
    else score -= groupTitle === "Final Visual References" ? 14 : 3;
  }
  if (/family\s*guy|\u6076\u641e\u4e4b\u5bb6/.test(prompt)) {
    if (containsAny(candidateText, ["family guy", "griffin", "peter griffin", "lois griffin", "stewie", "brian griffin"])) score += 8;
    else score -= groupTitle === "Final Visual References" || groupTitle === "Clothing References" ? 12 : 4;
  }
  if (prompt.includes("1920")) {
    if (containsAny(candidateText, ["1920", "roaring twenties", "flapper", "art deco"])) score += 4;
    else if (groupTitle !== "Scene References") score -= 3;
  }

  return { ...candidate, score };
}

function matchesNamedWork(value, namedWork) {
  const text = String(value || "").toLowerCase();
  const work = String(namedWork || "").toLowerCase();
  if (!work) return false;
  if (text.includes(work)) return true;
  const tokens = queryTokens(work).filter((token) => token.length >= 3);
  return tokens.length > 0 && tokens.every((token) => text.includes(token));
}

function normalizeImageKey(value = "") {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname}`.toLowerCase().replace(/\/+$/, "");
  } catch {
    return value.toLowerCase();
  }
}

export { rankAndSelectImages };
