"use strict";
(() => {
  // content/extract-text.js
  function clean(text) {
    return text.replace(/\s+/g, " ").trim();
  }
  function pageColor() {
    const body = getComputedStyle(document.body).backgroundColor;
    if (body && body !== "rgba(0, 0, 0, 0)")
      return body;
    return getComputedStyle(document.documentElement).backgroundColor || "rgb(255, 255, 255)";
  }
  function extractSelection() {
    const selection = window.getSelection();
    const text = selection ? selection.toString() : "";
    return {
      text: clean(text),
      url: location.href,
      title: document.title,
      pageColor: pageColor()
    };
  }

  // utils/logger.js
  var ENABLE_LOG = true;
  function log(scope, ...args) {
    if (!ENABLE_LOG)
      return;
    console.log(`[ChromeAI:${scope}]`, ...args);
  }

  // content/content-script.ts
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
      const response = {};
      if (msg.type === "content:get_selection") {
        response.text = extractSelection();
      }
      sendResponse(response);
    })();
    return true;
  });
  log("content", "content script injected");
})();
