import { state } from "./state.js";
import { toast } from "./toast.js";

function fileBaseName() {
  return (state.lastPlan?.theme || "selfie-studio-plan").replace(/[\/:*?"<>|]/g, "-");
}

async function exportPng() {
  const card = document.querySelector("#export-card");
  await ensureExportLibraries();
  if (!card || !window.html2canvas) {
    toast("Export libraries are still loading. Please try again in a moment.");
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
    toast("Export libraries are still loading. Please try again in a moment.");
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
      enableLinks: true,
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

export { exportPng, exportPdf };
