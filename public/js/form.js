import { counter, form, hint, luckyBtn, promptInput, startBtn } from "./dom.js";

function selectedType() {
  return new FormData(form).get("photoType");
}

function updateFormState() {
  const hasType = Boolean(selectedType());
  promptInput.disabled = !hasType;
  luckyBtn.disabled = !hasType;
  startBtn.disabled = !hasType || !promptInput.value.trim();
  hint.textContent = hasType ? "Enter a theme prompt, or try I'm Feeling Lucky" : "Choose a subject type to enable generation";
}

function autoResizeTextarea() {
  promptInput.style.height = "auto";
  const lineHeight = parseFloat(getComputedStyle(promptInput).lineHeight);
  const maxHeight = lineHeight * 6 + 62;
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, maxHeight)}px`;
  counter.textContent = `${promptInput.value.length} / 1200`;
}

function setLoading(isLoading, loadingOverlay) {
  document.body.classList.toggle("loading", isLoading);
  loadingOverlay?.setAttribute("aria-hidden", String(!isLoading));
}

export { selectedType, updateFormState, autoResizeTextarea, setLoading };
