import { form, imageModal, imageSearchToggle, luckyBtn, promptInput } from "./dom.js";
import { loadPublicConfig, imageSearchConfigMessage } from "./config.js";
import { autoResizeTextarea, updateFormState } from "./form.js";
import { generate } from "./generate.js";
import { closeImageModal, moveModal } from "./modal.js";
import { state } from "./state.js";
import { toast } from "./toast.js";

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
  if (state.publicConfig.imageSearch?.enabled) return;
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
