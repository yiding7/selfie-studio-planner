import { imageSearchToggle, loadingOverlay, loadingHeading, loadingDetail, loadingPhaseEls, luckyBtn, promptInput, result, startBtn } from "./dom.js";
import { imageSearchConfigMessage } from "./config.js";
import { renderResult } from "./render.js";
import { selectedType, setLoading } from "./form.js";
import { state } from "./state.js";
import { toast } from "./toast.js";

const PROMPT_PHASES = [
  { heading: "Researching your theme", detail: "Gathering visual context, period facts, and verified references" },
  { heading: "Generating shoot plan", detail: "Composing lighting, outfits, props, scenes, and composition guidance" },
  { heading: "Finding reference images", detail: "Searching and filtering visual references for all four groups" }
];

const LUCKY_PHASES = [
  { heading: "Rolling the dice", detail: "Choosing a surprise concept" },
  { heading: "Generating shoot plan", detail: "Composing lighting, outfits, props, scenes, and composition guidance" },
  { heading: "Finding reference images", detail: "Searching and filtering visual references for all four groups" }
];

function setLoadingPhase(index, phases) {
  const phase = phases[index];
  if (!phase) return;
  if (loadingHeading) loadingHeading.textContent = phase.heading;
  if (loadingDetail) loadingDetail.textContent = phase.detail;
  loadingPhaseEls.forEach((el) => {
    el.classList.toggle("active", Number(el.dataset.phase) === index);
  });
}

function startPhaseCycling(mode) {
  const phases = mode === "lucky" ? LUCKY_PHASES : PROMPT_PHASES;
  setLoadingPhase(0, phases);
  const t1 = setTimeout(() => setLoadingPhase(1, phases), mode === "lucky" ? 1500 : 3500);
  const t2 = setTimeout(() => setLoadingPhase(2, phases), mode === "lucky" ? 4000 : 10000);
  return () => { clearTimeout(t1); clearTimeout(t2); };
}

async function generate(mode) {
  const payload = {
    photoType: selectedType(),
    prompt: promptInput.value.trim(),
    mode,
    imageSearch: imageSearchToggle?.checked ?? false
  };

  if (!payload.photoType) {
    toast("Choose a subject type first.");
    return;
  }
  if (mode === "prompt" && !payload.prompt) {
    toast("Enter a theme prompt, or click I'm Feeling Lucky.");
    return;
  }
  if (payload.imageSearch && !state.publicConfig.imageSearch?.enabled) {
    toast(imageSearchConfigMessage());
    return;
  }

  state.lastRequest = payload;
  setLoading(true, loadingOverlay);
  result.replaceChildren();
  result.classList.add("hidden");
  startBtn.textContent = "Generating...";
  luckyBtn.textContent = "Rolling...";

  const stopCycling = startPhaseCycling(mode);

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Generation failed");
    state.lastPlan = data.plan;
    state.lastBackgroundContext = data.backgroundContext || {};
    renderResult(data.plan, data.backgroundContext || {}, mode, generate);
    result.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    toast(error.message || "Generation failed. Please try again later.");
  } finally {
    stopCycling();
    setLoading(false, loadingOverlay);
    startBtn.textContent = "Generate";
    luckyBtn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7.4 12 3l7 4.4v9.2L12 21l-7-4.4V7.4Zm2.2 1.2v6.8L12 18.5l4.8-3.1V8.6L12 5.5 7.2 8.6Zm3.1 1.4h1.4v1.4h-1.4V10Zm3 2.6h1.4V14h-1.4v-1.4Zm-4 2.1h1.4v1.4H9.3v-1.4Z"/></svg>I'm Feeling Lucky`;
  }
}

export { generate };
