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
  var ENABLE_DEBUG_LOG = false;
  function safe(values) {
    return values.map((value) => {
      if (value === null || value === void 0 || typeof value === "boolean" || typeof value === "number")
        return value;
      if (typeof value === "string" && /^[a-z0-9_.:/-]{1,96}$/i.test(value))
        return value;
      if (value instanceof Error)
        return value.name;
      return "[redacted]";
    });
  }
  function log(scope, ...args) {
    if (!ENABLE_DEBUG_LOG)
      return;
    console.log(`[SelectPilot:${scope}]`, ...safe(args));
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
