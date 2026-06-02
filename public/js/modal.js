import { imageModal } from "./dom.js";
import { state } from "./state.js";

function openImageModal(images, index) {
  state.modalImages = images;
  state.modalIndex = index;
  updateImageModal();
  imageModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function updateImageModal() {
  const entry = state.modalImages[state.modalIndex];
  if (!entry) return;
  const img = imageModal.querySelector("img");
  const title = imageModal.querySelector("strong");
  const meta = imageModal.querySelector("span");
  const link = imageModal.querySelector("a");
  img.src = proxiedImageUrl(entry.imageUrl || entry.thumbUrl || "");
  img.alt = entry.title || entry.item?.title || "Reference image";
  title.textContent = entry.title || entry.item?.title || "Reference image";
  meta.textContent = [entry.item?.note, entry.license, entry.author].filter(Boolean).join(" - ");
  link.href = entry.pageUrl || entry.imageUrl || entry.thumbUrl;
}

function proxiedImageUrl(url) {
  return url ? `/api/image?url=${encodeURIComponent(url)}` : "";
}

function moveModal(step) {
  if (state.modalImages.length === 0) return;
  state.modalIndex = (state.modalIndex + step + state.modalImages.length) % state.modalImages.length;
  updateImageModal();
}

function closeImageModal() {
  imageModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

export { openImageModal, moveModal, closeImageModal, proxiedImageUrl };
