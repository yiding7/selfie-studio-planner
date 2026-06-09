import { result, template } from "./dom.js";
import { state } from "./state.js";
import { toast } from "./toast.js";
import { exportPdf, exportPng } from "./export.js";
import { openImageModal, proxiedImageUrl } from "./modal.js";

function renderResult(plan, backgroundContext, mode, generate) {
  const fragment = template.content.cloneNode(true);
  const exportCard = fragment.querySelector("#export-card");
  fragment.querySelector('[data-field="theme"]').textContent = plan.theme;
  fragment.querySelector('[data-field="subtitle"]').textContent = plan.subtitle;

  const palette = Array.isArray(plan.palette) && plan.palette.length >= 3
    ? plan.palette
    : ["#8E0220", "#2B2B2B", "#F7F4F1"];
  exportCard.style.setProperty("--c1", palette[0]);
  exportCard.style.setProperty("--c2", palette[1]);
  exportCard.style.setProperty("--c3", palette[2]);

  renderReferenceGroups(fragment.querySelector('[data-field="references"]'), plan.referenceGroups, plan.references);

  const sections = fragment.querySelector('[data-field="sections"]');
  for (const [title, points] of Object.entries(plan.sections || {})) {
    const row = document.createElement("div");
    row.className = "section-row";
    row.innerHTML = `<div class="section-title"></div><ul class="section-content"></ul>`;
    row.querySelector(".section-title").textContent = title;
    const list = row.querySelector("ul");
    for (const point of points || []) {
      const li = document.createElement("li");
      li.textContent = point;
      list.append(li);
    }
    sections.append(row);
  }

  fillList(fragment.querySelector('[data-field="shoppingList"]'), plan.shoppingList);
  fillList(fragment.querySelector('[data-field="shotList"]'), plan.shotList);

  renderResearchContext(fragment.querySelector('[data-field="research-context"]'), backgroundContext);

  const reroll = fragment.querySelector('[data-action="reroll"]');
  fragment.querySelector('[data-action="regenerate"]').addEventListener("click", () => generate(state.lastRequest?.mode || mode));
  if (mode === "lucky") {
    reroll.addEventListener("click", () => generate("lucky"));
  } else {
    reroll.remove();
  }
  fragment.querySelector('[data-action="png"]').addEventListener("click", exportPng);
  fragment.querySelector('[data-action="pdf"]').addEventListener("click", exportPdf);

  result.replaceChildren(fragment);
  result.classList.remove("hidden");
}

function renderReferenceGroups(container, groups = [], legacyReferences = []) {
  container.replaceChildren();
  const normalizedGroups = Array.isArray(groups) && groups.length > 0
    ? groups
    : legacyReferences.map((item) => ({ title: item.title, description: item.prompt, items: [item] }));

  for (const group of normalizedGroups) {
    const section = document.createElement("section");
    section.className = "reference-group";
    const heading = document.createElement("div");
    heading.className = "reference-heading";
    heading.innerHTML = `<div><h3></h3><p></p></div>`;
    heading.querySelector("h3").textContent = group.title || "Reference";
    heading.querySelector("p").textContent = group.description || "";

    const gallery = document.createElement("div");
    gallery.className = "reference-gallery";

    const items = Array.isArray(group.items) ? group.items : [];
    const groupImages = Array.isArray(group.images) ? group.images : [];
    const images = groupImages.map((image, index) => ({ ...image, item: items[index % Math.max(items.length, 1)] }));
    const previewImages = images.filter((image) => image.thumbUrl || image.imageUrl);

    for (const entry of images) {
      const hasPreview = Boolean(entry.thumbUrl || entry.imageUrl);
      if (hasPreview) {
        const tile = document.createElement("figure");
        tile.className = "reference-tile";
        tile.innerHTML = `<button class="reference-thumb" type="button"><img alt="" loading="lazy" /><span></span></button><figcaption><a target="_blank" rel="noreferrer">Open source</a></figcaption>`;
        const button = tile.querySelector("button");
        const image = tile.querySelector("img");
        const sourceLink = tile.querySelector("a");
        image.src = proxiedImageUrl(entry.thumbUrl || entry.imageUrl);
        image.alt = entry.title || entry.item?.title || group.title || "Reference image";
        image.addEventListener("error", () => {
          tile.replaceWith(buildSourceCard(entry));
        }, { once: true });
        button.querySelector("span").textContent = entry.item?.title || entry.title || "Reference image";
        button.addEventListener("click", () => openImageModal(previewImages, previewImages.indexOf(entry)));
        sourceLink.href = entry.pageUrl || entry.imageUrl || entry.thumbUrl || "#";
        appendSearchQueries(tile.querySelector("figcaption"), entry.item || entry);
        gallery.append(tile);
      } else {
        gallery.append(buildSourceCard(entry));
      }
    }

    if (images.length === 0) {
      for (const item of items.slice(0, 4)) {
        const fallback = document.createElement("div");
        fallback.className = "reference-fallback";
        fallback.innerHTML = `<strong></strong><p></p>`;
        fallback.querySelector("strong").textContent = formatReferenceTitle(item);
        fallback.querySelector("p").textContent = formatReferenceNote(item);
        appendSearchQueries(fallback, item);
        gallery.append(fallback);
      }
    }

    if (group.imageSearchError) {
      const warning = document.createElement("p");
      warning.className = "image-search-warning";
      warning.textContent = group.imageSearchError;
      section.append(heading, gallery, warning);
    } else {
      section.append(heading, gallery);
    }

    const notes = document.createElement("div");
    notes.className = "reference-notes";
    for (const item of items) {
      const note = document.createElement("p");
      const keywords = Array.isArray(item.keywords) && item.keywords.length > 0 ? ` | ${item.keywords.join(" / ")}` : "";
      const warnings = [item.frameUse, item.anachronismWarning, item.weakReason ? `Weak reference: ${item.weakReason}` : ""].filter(Boolean).join(" | ");
      note.textContent = `${item.title || group.title}: ${item.note || item.searchQuery || ""}${keywords}${warnings ? ` | ${warnings}` : ""}`;
      notes.append(note);
    }

    section.append(notes);
    container.append(section);
  }
}

function appendSearchQueries(container, item) {
  const queries = collectSearchQueries(item);
  if (queries.length === 0) return;
  const list = document.createElement("div");
  list.className = "item-query-list";
  for (const query of queries) {
    list.append(buildSearchQueryChip(query));
  }
  container.append(list);
}

function buildSearchQueryChip(query) {
  const link = document.createElement("a");
  link.className = "search-query-chip";
  link.href = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = query;
  link.title = "Open this image search query";
  link.addEventListener("click", () => copySearchQuery(query));
  return link;
}

function collectSearchQueries(item) {
  const values = Array.isArray(item?.manualSearchQueries) && item.manualSearchQueries.length > 0
    ? item.manualSearchQueries
    : [item?.searchQuery].filter(Boolean);
  return values
    .map((query) => String(query || "").trim())
    .filter(Boolean)
    .filter((query, index, array) => array.indexOf(query) === index)
    .slice(0, 5);
}

async function copySearchQuery(query) {
  try {
    await navigator.clipboard?.writeText(query);
    toast("Search query copied.");
  } catch {
    // Opening the search link still gives the user a useful fallback.
  }
}

function buildSourceCard(entry) {
  const item = entry.item || entry;
  const card = document.createElement("div");
  card.className = "reference-source-card";
  card.innerHTML = `<strong></strong><p></p><a target="_blank" rel="noreferrer">Open source</a>`;
  card.querySelector("strong").textContent = formatReferenceTitle(item);
  card.querySelector("p").textContent = formatReferenceNote(item);
  card.querySelector("a").href = entry.pageUrl || entry.imageUrl || "#";
  appendSearchQueries(card, item);
  return card;
}

function formatReferenceTitle(item) {
  const prefix = item.matchStrength === "weak" ? "Weak reference - " : "";
  const subject = item.forSubject ? `${item.forSubject} - ` : "";
  return `${prefix}${subject}${item.title || "Reference"}`;
}

function formatReferenceNote(item) {
  return [item.note || item.prompt || item.query || "", item.weakReason ? `Weak-reference reason: ${item.weakReason}` : ""]
    .filter(Boolean)
    .join(" ");
}

function fillList(list, items = []) {
  list.replaceChildren();
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = item;
    list.append(li);
  }
}

function renderResearchContext(container, ctx) {
  if (!container) return;
  container.replaceChildren();
  if (!ctx || typeof ctx !== "object") return;

  const ARRAY_FIELDS = [
    ["costumeNotes", "Costume"],
    ["propNotes", "Props"],
    ["sceneNotes", "Scenes"],
    ["searchHints", "Search Hints"]
  ];
  const TEXT_FIELDS = [
    ["lightingNotes", "Lighting"],
    ["poseNotes", "Pose & Expression"],
    ["colorGradeNotes", "Color Grade"]
  ];

  const hasContent = [ctx.visualStyle, ...ARRAY_FIELDS.map(([k]) => ctx[k]), ...TEXT_FIELDS.map(([k]) => ctx[k])]
    .some((v) => v && (Array.isArray(v) ? v.length > 0 : true));
  if (!hasContent) return;

  const details = document.createElement("details");
  details.className = "research-context";
  details.open = true;

  const summary = document.createElement("summary");
  summary.className = "research-context-summary";
  const badge = document.createElement("span");
  badge.className = "research-badge";
  badge.textContent = "Research";
  const titleEl = document.createElement("span");
  titleEl.className = "research-title";
  titleEl.textContent = ctx.namedWork || "Background Context";
  summary.append(badge, titleEl);
  details.append(summary);

  const body = document.createElement("div");
  body.className = "research-context-body";

  if (ctx.visualStyle) {
    const intro = document.createElement("p");
    intro.className = "research-visual-style";
    intro.textContent = ctx.visualStyle;
    body.append(intro);
  }

  for (const [key, label] of ARRAY_FIELDS) {
    const value = ctx[key];
    if (!Array.isArray(value) || value.length === 0) continue;
    const row = document.createElement("div");
    row.className = "research-row";
    const labelEl = document.createElement("span");
    labelEl.className = "research-label";
    labelEl.textContent = label;
    const valueEl = document.createElement("span");
    valueEl.className = "research-value research-tags";
    for (const item of value) {
      const tag = document.createElement("span");
      tag.className = "research-fact-tag";
      tag.textContent = item;
      valueEl.append(tag);
    }
    row.append(labelEl, valueEl);
    body.append(row);
  }

  for (const [key, label] of TEXT_FIELDS) {
    const value = ctx[key];
    if (!value) continue;
    const row = document.createElement("div");
    row.className = "research-row";
    const labelEl = document.createElement("span");
    labelEl.className = "research-label";
    labelEl.textContent = label;
    const valueEl = document.createElement("span");
    valueEl.className = "research-value";
    valueEl.textContent = value;
    row.append(labelEl, valueEl);
    body.append(row);
  }

  details.append(body);
  container.append(details);
}

export { renderResult };
