export const state = {
  lastRequest: null,
  lastPlan: null,
  lastBackgroundContext: {},
  modalImages: [],
  modalIndex: 0,
  publicConfig: {
    imageSearch: { enabled: false, provider: null },
    llm: { configured: false, provider: null }
  }
};
