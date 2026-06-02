const form = document.querySelector("#generator-form");
const promptInput = document.querySelector("#prompt");
const counter = document.querySelector("#counter");
const startBtn = document.querySelector("#start-btn");
const luckyBtn = document.querySelector("#lucky-btn");
const imageSearchToggle = document.querySelector("#image-search-toggle");
const hint = document.querySelector("#form-hint");
const result = document.querySelector("#result");
const template = document.querySelector("#result-template");
const imageModal = document.querySelector("#image-modal");
const loadingOverlay = document.querySelector("#loading-overlay");

let lastRequest = null;
let lastPlan = null;
let modalImages = [];
let modalIndex = 0;
let publicConfig = {
  imageSearch: { enabled: false, provider: null },
  llm: { configured: false, provider: null }
};

function selectedType() {
  return new FormData(form).get("photoType");
}

function updateFormState() {
  const hasType = Boolean(selectedType());
  promptInput.disabled = !hasType;
  luckyBtn.disabled = !hasType;
  startBtn.disabled = !hasType || !promptInput.value.trim();
  hint.textContent = hasType ? "可以输入主题 prompt，或直接试试手气" : "请先选择拍摄主体以激活生成按钮";
}

function autoResizeTextarea() {
  promptInput.style.height = "auto";
  const lineHeight = parseFloat(getComputedStyle(promptInput).lineHeight);
  const maxHeight = lineHeight * 6 + 62;
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, maxHeight)}px`;
  counter.textContent = `${promptInput.value.length} / 1200`;
}

function toast(message) {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.append(node);
  setTimeout(() => node.remove(), 2600);
}

async function generate(mode) {
  const payload = {
    photoType: selectedType(),
    prompt: promptInput.value.trim(),
    mode,
    imageSearch: imageSearchToggle?.checked ?? false
  };

  if (!payload.photoType) {
    toast("请先选择拍摄主体。");
    return;
  }
  if (mode === "prompt" && !payload.prompt) {
    toast("请输入主题 prompt，或点击试试手气。");
    return;
  }
  if (payload.imageSearch && !publicConfig.imageSearch?.enabled) {
    toast(imageSearchConfigMessage());
    return;
  }

  lastRequest = payload;
  setLoading(true);
  result.replaceChildren();
  result.classList.add("hidden");
  startBtn.textContent = "生成中...";
  luckyBtn.textContent = "掷骰中...";

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "生成失败");
    lastPlan = data.plan;
    renderResult(data.plan, mode);
    result.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    toast(error.message || "生成失败，请稍后重试。");
  } finally {
    setLoading(false);
    startBtn.textContent = "开始生成";
    luckyBtn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7.4 12 3l7 4.4v9.2L12 21l-7-4.4V7.4Zm2.2 1.2v6.8L12 18.5l4.8-3.1V8.6L12 5.5 7.2 8.6Zm3.1 1.4h1.4v1.4h-1.4V10Zm3 2.6h1.4V14h-1.4v-1.4Zm-4 2.1h1.4v1.4H9.3v-1.4Z"/></svg>试试手气`;
  }
}

function fileBaseName() {
  return (lastPlan?.theme || "自拍灵感").replace(/[\\/:*?"<>|]/g, "-");
}

function setLoading(isLoading) {
  document.body.classList.toggle("loading", isLoading);
  loadingOverlay?.setAttribute("aria-hidden", String(!isLoading));
}

async function loadPublicConfig() {
  try {
    const response = await fetch("/api/config");
    if (response.ok) publicConfig = await response.json();
  } catch {
    publicConfig = {
      imageSearch: { enabled: false, provider: null },
      llm: { configured: false, provider: null }
    };
  }

  updateImageSearchToggle();
}

function updateImageSearchToggle() {
  if (!imageSearchToggle) return;
  const enabled = Boolean(publicConfig.imageSearch?.enabled);
  imageSearchToggle.disabled = !enabled;
  imageSearchToggle.checked = enabled;
  const label = imageSearchToggle.closest(".search-toggle");
  label?.classList.toggle("disabled", !enabled);
  const message = enabled
    ? `已启用 ${formatImageSearchProvider(publicConfig.imageSearch.provider)}`
    : imageSearchConfigMessage();
  label?.setAttribute("title", message);
}

function formatImageSearchProvider(provider) {
  if (provider === "brave") return "Brave Search";
  return "图片搜索";
}

function imageSearchConfigMessage() {
  return "未配置图片搜索 API：请在 .env 设置 BRAVE_SEARCH_API_KEY 后重启服务。";
}

function renderResult(plan, mode) {
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

  const reroll = fragment.querySelector('[data-action="reroll"]');
  fragment.querySelector('[data-action="regenerate"]').addEventListener("click", () => generate(lastRequest?.mode || mode));
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
    heading.querySelector("h3").textContent = group.title || "参考";
    heading.querySelector("p").textContent = group.description || "";

    const gallery = document.createElement("div");
    gallery.className = "reference-gallery";

    const items = Array.isArray(group.items) ? group.items : [];
    const groupImages = Array.isArray(group.images) ? group.images : [];
    const images = groupImages.map((image, index) => ({ ...image, item: items[index % Math.max(items.length, 1)] }));
    const previewImages = images.filter((image) => image.thumbUrl || image.imageUrl);

    for (const entry of images) {
      const button = document.createElement("button");
      button.className = "reference-thumb";
      button.type = "button";
      const hasPreview = Boolean(entry.thumbUrl || entry.imageUrl);
      if (hasPreview) {
        button.innerHTML = `<img alt="" loading="lazy" /><span></span>`;
        const image = button.querySelector("img");
        image.src = proxiedImageUrl(entry.thumbUrl || entry.imageUrl);
        image.alt = entry.title || entry.item?.title || group.title || "参考图";
        image.addEventListener("error", () => {
          const link = buildSourceCard(entry);
          button.replaceWith(link);
        }, { once: true });
        button.querySelector("span").textContent = entry.item?.title || entry.title || "参考图";
        button.addEventListener("click", () => openImageModal(previewImages, previewImages.indexOf(entry)));
        gallery.append(button);
      } else {
        gallery.append(buildSourceCard(entry));
      }
    }

    if (images.length === 0) {
      for (const item of items.slice(0, 4)) {
        const fallback = document.createElement("div");
        fallback.className = "reference-fallback";
        fallback.innerHTML = `<strong></strong><p></p><small></small>`;
        fallback.querySelector("strong").textContent = formatReferenceTitle(item);
        fallback.querySelector("p").textContent = formatReferenceNote(item);
        fallback.querySelector("small").textContent = item.searchQuery || "";
        gallery.append(fallback);
      }
    }

    const notes = document.createElement("div");
    notes.className = "reference-notes";
    for (const item of items) {
      const note = document.createElement("p");
      const keywords = Array.isArray(item.keywords) && item.keywords.length > 0 ? ` ｜ ${item.keywords.join(" / ")}` : "";
      const warnings = [item.frameUse, item.anachronismWarning, item.weakReason ? `弱参考：${item.weakReason}` : ""].filter(Boolean).join(" ｜ ");
      note.textContent = `${item.title || group.title}: ${item.note || item.searchQuery || ""}${keywords}${warnings ? ` ｜ ${warnings}` : ""}`;
      notes.append(note);
    }

    section.append(heading, gallery, notes);
    container.append(section);
  }
}

function buildSourceCard(entry) {
  const item = entry.item || entry;
  const link = document.createElement("a");
  link.className = "reference-source-card";
  link.href = entry.pageUrl || entry.imageUrl || "#";
  link.target = "_blank";
  link.rel = "noreferrer";
  link.innerHTML = `<strong></strong><p></p><small>打开参考来源</small>`;
  link.querySelector("strong").textContent = formatReferenceTitle(item);
  link.querySelector("p").textContent = formatReferenceNote(item);
  return link;
}

function formatReferenceTitle(item) {
  const prefix = item.matchStrength === "weak" ? "弱参考 · " : "";
  const subject = item.forSubject ? `${item.forSubject} · ` : "";
  return `${prefix}${subject}${item.title || "参考"}`;
}

function formatReferenceNote(item) {
  return [item.note || item.prompt || item.query || "", item.weakReason ? `弱参考原因：${item.weakReason}` : ""]
    .filter(Boolean)
    .join(" ");
}

function openImageModal(images, index) {
  modalImages = images;
  modalIndex = index;
  updateImageModal();
  imageModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function updateImageModal() {
  const entry = modalImages[modalIndex];
  if (!entry) return;
  const img = imageModal.querySelector("img");
  const title = imageModal.querySelector("strong");
  const meta = imageModal.querySelector("span");
  const link = imageModal.querySelector("a");
  img.src = proxiedImageUrl(entry.imageUrl || entry.thumbUrl || "");
  img.alt = entry.title || entry.item?.title || "参考图";
  title.textContent = entry.title || entry.item?.title || "参考图";
  meta.textContent = [entry.item?.note, entry.license, entry.author].filter(Boolean).join(" · ");
  link.href = entry.pageUrl || entry.imageUrl || entry.thumbUrl;
}

function proxiedImageUrl(url) {
  return url ? `/api/image?url=${encodeURIComponent(url)}` : "";
}

function moveModal(step) {
  if (modalImages.length === 0) return;
  modalIndex = (modalIndex + step + modalImages.length) % modalImages.length;
  updateImageModal();
}

function closeImageModal() {
  imageModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function fillList(list, items = []) {
  list.replaceChildren();
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = item;
    list.append(li);
  }
}

async function exportPng() {
  const card = document.querySelector("#export-card");
  await ensureExportLibraries();
  if (!card || !window.html2canvas) {
    toast("导出库还未加载完成，请稍后再试。");
    return;
  }
  await waitForImages(card);
  const canvas = await window.html2canvas(card, {
    backgroundColor: "#ffffff",
    scale: Math.min(window.devicePixelRatio || 2, 2),
    useCORS: true,
    allowTaint: true,
    scrollX: 0,
    scrollY: 0
  });
  const link = document.createElement("a");
  link.download = `${fileBaseName()}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

async function exportPdf() {
  const card = document.querySelector("#export-card");
  await ensureExportLibraries();
  if (!card || !window.html2pdf) {
    toast("导出库还未加载完成，请稍后再试。");
    return;
  }
  await waitForImages(card);
  await window.html2pdf()
    .set({
      margin: 8,
      filename: `${fileBaseName()}.pdf`,
      image: { type: "jpeg", quality: 0.96 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        scrollX: 0,
        scrollY: 0
      },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"] }
    })
    .from(card)
    .save();
}

async function ensureExportLibraries() {
  const loaders = [];
  if (!window.html2canvas) {
    loaders.push(loadScript("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"));
  }
  if (!window.html2pdf) {
    loaders.push(loadScript("https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.3/dist/html2pdf.bundle.min.js"));
  }
  await Promise.allSettled(loaders);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = Array.from(document.scripts).find((script) => script.src === src);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.crossOrigin = "anonymous";
    script.referrerPolicy = "no-referrer";
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
}

function waitForImages(root) {
  const images = Array.from(root.querySelectorAll("img")).filter((img) => !img.complete);
  return Promise.all(images.map((img) => new Promise((resolve) => {
    img.addEventListener("load", resolve, { once: true });
    img.addEventListener("error", resolve, { once: true });
  })));
}

form.addEventListener("change", updateFormState);
promptInput.addEventListener("input", () => {
  autoResizeTextarea();
  updateFormState();
});
form.addEventListener("submit", (event) => {
  event.preventDefault();
  generate("prompt");
});
luckyBtn.addEventListener("click", () => generate("lucky"));
imageSearchToggle?.closest(".search-toggle")?.addEventListener("click", (event) => {
  if (publicConfig.imageSearch?.enabled) return;
  event.preventDefault();
  toast(imageSearchConfigMessage());
});
imageModal.querySelector(".modal-close").addEventListener("click", closeImageModal);
imageModal.querySelector(".prev").addEventListener("click", () => moveModal(-1));
imageModal.querySelector(".next").addEventListener("click", () => moveModal(1));
imageModal.addEventListener("click", (event) => {
  if (event.target === imageModal) closeImageModal();
});

let touchStartX = 0;
imageModal.addEventListener("touchstart", (event) => {
  touchStartX = event.changedTouches[0]?.clientX || 0;
}, { passive: true });
imageModal.addEventListener("touchend", (event) => {
  const delta = (event.changedTouches[0]?.clientX || 0) - touchStartX;
  if (Math.abs(delta) > 42) moveModal(delta > 0 ? -1 : 1);
}, { passive: true });

window.addEventListener("keydown", (event) => {
  if (imageModal.classList.contains("hidden")) return;
  if (event.key === "Escape") closeImageModal();
  if (event.key === "ArrowLeft") moveModal(-1);
  if (event.key === "ArrowRight") moveModal(1);
});

updateFormState();
autoResizeTextarea();
loadPublicConfig();
