function buildResearchPrompt({ photoType, prompt }) {
  const isChinese = /[㐀-鿿]/u.test(prompt);
  const langInstruction = isChinese
    ? "Required output language: Simplified Chinese. Write all JSON string values in Simplified Chinese. Keep JSON field names in English. searchHints must remain in English — they are used as image search queries."
    : "Required output language: English.";

  return `You are a visual research specialist for photography shoot planning. Research the visual context behind this shoot theme and return verified factual information for a creative director.

Subject type: ${photoType}
Shoot theme: ${prompt}

${langInstruction}

Return only concrete verified facts — confirmed visual style, period-accurate costume details, era-safe props, real scene types, confirmed lighting style, pose vocabulary, color grade direction. Do not plan the shoot. Do not invent citations, brand names, or historical facts. Label uncertain items as approximate.

Return JSON only:
{
  "namedWork": "Exact title if a specific film, TV series, music video, book adaptation, artist, or designer is named — or null",
  "visualStyle": "Confirmed visual look: if known, name the director of photography or lead designer; include confirmed color palette and overall tone",
  "costumeNotes": ["Specific verified garment name, fabric, silhouette, or key accessory detail", "..."],
  "propNotes": ["Era-verified specific object name with an era-safety note where relevant", "..."],
  "sceneNotes": ["Real location type, architectural character, or confirmed set design element", "..."],
  "lightingNotes": "Confirmed lighting character: hard or soft quality, main direction, contrast level, color temperature",
  "poseNotes": "Pose vocabulary, body language, and expression style confirmed for this reference or era",
  "colorGradeNotes": "Confirmed post-processing direction: overall tone, warmth, grain, contrast, saturation, vignette",
  "searchHints": ["Specific verified English search term useful for finding real reference images", "..."]
}`;
}

function extractResearchJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return {};
  try {
    return JSON.parse(match[0]);
  } catch {
    return {};
  }
}

function shouldRunResearch(mode, prompt) {
  return mode !== "lucky" && Boolean(prompt?.trim());
}

function formatBackgroundContext(ctx) {
  if (!ctx || typeof ctx !== "object") return "";
  const lines = [];
  if (ctx.namedWork) lines.push(`Named work: ${ctx.namedWork}`);
  if (ctx.visualStyle) lines.push(`Visual style: ${ctx.visualStyle}`);
  if (Array.isArray(ctx.costumeNotes) && ctx.costumeNotes.length > 0) lines.push(`Costume facts: ${ctx.costumeNotes.join("; ")}`);
  if (Array.isArray(ctx.propNotes) && ctx.propNotes.length > 0) lines.push(`Prop facts: ${ctx.propNotes.join("; ")}`);
  if (Array.isArray(ctx.sceneNotes) && ctx.sceneNotes.length > 0) lines.push(`Scene facts: ${ctx.sceneNotes.join("; ")}`);
  if (ctx.lightingNotes) lines.push(`Lighting: ${ctx.lightingNotes}`);
  if (ctx.poseNotes) lines.push(`Pose and expression: ${ctx.poseNotes}`);
  if (ctx.colorGradeNotes) lines.push(`Color grade direction: ${ctx.colorGradeNotes}`);
  if (lines.length === 0) return "";
  return `Research context (verified facts — use these to anchor every section of your plan, do not contradict them):\n${lines.map((l) => `- ${l}`).join("\n")}\n\n`;
}

export { buildResearchPrompt, extractResearchJson, formatBackgroundContext, shouldRunResearch };
