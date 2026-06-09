import { formatBackgroundContext } from "./research.js";

function detectOutputLanguage(prompt = "") {
  return /[\u3400-\u9fff]/u.test(prompt) ? "Simplified Chinese" : "English";
}

function buildPrompt({ photoType, prompt, mode, backgroundContext }) {
  const outputLanguage = detectOutputLanguage(prompt);
  const userIdea = prompt?.trim()
    ? `User theme prompt: ${prompt.trim()}`
    : "The user did not provide a theme. Choose a random but practical low-budget self-shoot concept, similar to an I'm Feeling Lucky dice roll.";

  const researchBlock = formatBackgroundContext(backgroundContext);

  return `You are a practical creative director for non-professional self portraits, couple photos, family photos, and friend-group portraits.
${researchBlock}Create a low-budget self-shoot plan for the subject type "${photoType}". ${userIdea}

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

export { buildPrompt, extractJson };
