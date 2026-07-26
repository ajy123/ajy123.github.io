// Entry point loaded directly by nyu/index.html. Kept deliberately tiny: its
// only job is to defer the real bundle (React, CursorChat, the case-study
// digest) until the browser is idle, so it never competes with the page's own
// paint. requestIdleCallback isn't available in every browser (notably
// Safari), so a short timeout stands in where it's missing.
const loadNyuChatApp = () => {
  void import("./nyuChatApp");
};

if (typeof window.requestIdleCallback === "function") {
  window.requestIdleCallback(loadNyuChatApp);
} else {
  window.setTimeout(loadNyuChatApp, 200);
}
