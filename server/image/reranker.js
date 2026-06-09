import { getProviderConfig } from "../llm.js";

const VISION_MODEL = process.env.VISION_RERANK_MODEL || "claude-haiku-4-5-20251001";
const VISION_TIMEOUT_MS = 10000;

async function rerankImageCandidates(candidates, group, context = {}) {
  if (!candidates || candidates.length <= 1) return candidates;

  const provider = getProviderConfig();
  if (provider.protocol !== "anthropic") return candidates;

  const imageUrls = candidates
    .slice(0, 12)
    .map((c) => c.thumbUrl || c.imageUrl)
    .filter((url) => Boolean(url) && (url.startsWith("https://") || url.startsWith("http://")));

  if (imageUrls.length < 2) return candidates;

  try {
    const scores = await callVisionScorer(imageUrls, group, context, provider);
    return applyVisionScores(candidates, scores);
  } catch {
    return candidates;
  }
}

async function callVisionScorer(imageUrls, group, context, provider) {
  const photoType = context.photoType || "person";
  const prompt = String(context.prompt || "");
  const groupTitle = group.title || "";
  const namedWork = context.backgroundContext?.namedWork;

  const themeDescription = [namedWork && `named work: ${namedWork}`, prompt && `theme: ${prompt}`]
    .filter(Boolean).join(", ") || "general portrait";

  const contentBlocks = [
    {
      type: "text",
      text: buildVisionPrompt(photoType, themeDescription, groupTitle, imageUrls.length)
    }
  ];

  for (const url of imageUrls) {
    contentBlocks.push({ type: "image", source: { type: "url", url } });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);

  try {
    const baseUrl = (provider.baseUrl || "https://api.anthropic.com/v1").replace(/\/+$/, "").replace(/\/management$/, "");
    const response = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": provider.apiKey,
        "anthropic-version": process.env.ANTHROPIC_VERSION || "2023-06-01"
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        max_tokens: 512,
        temperature: 0,
        messages: [{ role: "user", content: contentBlocks }]
      }),
      signal: controller.signal
    });

    if (!response.ok) return null;
    const data = await response.json();
    const text = data.content?.map((p) => p.text || "").join("") || "";
    return parseVisionScores(text, imageUrls.length);
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildVisionPrompt(photoType, themeDescription, groupTitle, count) {
  return `Rate ${count} images for a ${photoType} photo shoot (${themeDescription}). Reference group: ${groupTitle}.

For each image index 0 to ${count - 1}, rate 1–5:
- s: subject match — does it show the right subject type (${photoType})? 1=wrong, 5=perfect
- t: theme match — does it fit the theme/era/style? 1=irrelevant, 5=excellent
- r: real photo — is this a real photograph (not AI art, illustration, vector, product render)? 1=not real, 5=clearly real

Return only compact JSON array, no extra text: [{"i":0,"s":X,"t":X,"r":X},...]`;
}

function parseVisionScores(text, expectedCount) {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return null;
    const scores = new Map();
    for (const entry of arr) {
      if (typeof entry.i === "number") {
        scores.set(entry.i, {
          subjectMatch: clamp(Number(entry.s) || 3, 1, 5),
          themeMatch: clamp(Number(entry.t) || 3, 1, 5),
          isRealPhoto: clamp(Number(entry.r) || 3, 1, 5)
        });
      }
    }
    return scores.size >= Math.min(expectedCount, 2) ? scores : null;
  } catch {
    return null;
  }
}

function applyVisionScores(candidates, scores) {
  if (!scores) return candidates;

  const scored = candidates.map((candidate, index) => {
    const vision = scores.get(index);
    if (!vision) return { ...candidate, combinedScore: (candidate.score || 0) * 0.4 };

    const visionAvg = (vision.subjectMatch + vision.themeMatch + vision.isRealPhoto) / 3;
    const visionNormalized = ((visionAvg - 1) / 4) * 10;

    const baseScore = candidate.score || 0;
    const combined = baseScore * 0.4 + visionNormalized * 0.6;

    const isDisqualified = vision.isRealPhoto <= 1 || vision.subjectMatch <= 1;
    return { ...candidate, combinedScore: isDisqualified ? -1 : combined };
  });

  return scored
    .filter((c) => c.combinedScore >= 0)
    .sort((a, b) => b.combinedScore - a.combinedScore);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export { rerankImageCandidates };
