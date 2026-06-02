import { imageSearchToggle, loadingOverlay, luckyBtn, promptInput, result, startBtn } from "./dom.js";
import { imageSearchConfigMessage } from "./config.js";
import { renderResult } from "./render.js";
import { selectedType, setLoading } from "./form.js";
import { state } from "./state.js";
import { toast } from "./toast.js";

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

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Generation failed");
    state.lastPlan = data.plan;
    renderResult(data.plan, mode, generate);
    result.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    toast(error.message || "Generation failed. Please try again later.");
  } finally {
    setLoading(false, loadingOverlay);
    startBtn.textContent = "Generate";
    luckyBtn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7.4 12 3l7 4.4v9.2L12 21l-7-4.4V7.4Zm2.2 1.2v6.8L12 18.5l4.8-3.1V8.6L12 5.5 7.2 8.6Zm3.1 1.4h1.4v1.4h-1.4V10Zm3 2.6h1.4V14h-1.4v-1.4Zm-4 2.1h1.4v1.4H9.3v-1.4Z"/></svg>I'm Feeling Lucky`;
  }
}

export { generate };
