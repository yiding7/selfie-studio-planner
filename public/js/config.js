import { imageSearchToggle } from "./dom.js";
import { state } from "./state.js";

async function loadPublicConfig() {
  try {
    const response = await fetch("/api/config");
    if (response.ok) state.publicConfig = await response.json();
  } catch {
    state.publicConfig = {
      imageSearch: { enabled: false, provider: null },
      llm: { configured: false, provider: null }
    };
  }

  updateImageSearchToggle();
}

function updateImageSearchToggle() {
  if (!imageSearchToggle) return;
  const enabled = Boolean(state.publicConfig.imageSearch?.enabled);
  imageSearchToggle.disabled = !enabled;
  imageSearchToggle.checked = enabled;
  const label = imageSearchToggle.closest(".search-toggle");
  label?.classList.toggle("disabled", !enabled);
  const message = enabled
    ? `Enabled: ${formatImageSearchProvider(state.publicConfig.imageSearch.provider)}`
    : imageSearchConfigMessage();
  label?.setAttribute("title", message);
}

function formatImageSearchProvider(provider) {
  if (provider === "brave") return "Brave Search";
  return "Image Search";
}

function imageSearchConfigMessage() {
  return "Image search is not configured. Set BRAVE_SEARCH_API_KEY in .env and restart the server.";
}

export { loadPublicConfig, imageSearchConfigMessage };
