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
  function extractDocumentText() {
    const article = document.querySelector("article");
    const target = article || document.body;
    const text = clean(target.innerText || "");
    return {
      text,
      url: location.href,
      title: document.title,
      pageColor: pageColor()
    };
  }

  // content/extract-audio.js
  function extractAudio() {
    const audio = document.querySelector("audio");
    if (!audio)
      return null;
    return {
      audioUrl: audio.currentSrc || audio.src || void 0,
      duration: Number.isFinite(audio.duration) ? audio.duration : void 0,
      title: document.title,
      pageUrl: location.href
    };
  }

  // content/extract-video.js
  async function captureFrame(video) {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx)
        return void 0;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/png");
    } catch (e) {
      console.error("frame capture failed", e);
      return void 0;
    }
  }
  async function extractVideo() {
    const video = document.querySelector("video");
    if (!video)
      return null;
    return {
      poster: video.poster || void 0,
      currentTime: video.currentTime,
      duration: Number.isFinite(video.duration) ? video.duration : void 0,
      frame: await captureFrame(video),
      pageUrl: location.href
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
      if (msg.type === "content:get_document") {
        response.documentText = extractDocumentText();
      }
      if (msg.type === "content:get_audio") {
        response.audio = extractAudio();
      }
      if (msg.type === "content:get_video") {
        response.video = await extractVideo();
      }
      sendResponse(response);
    })();
    return true;
  });
  log("content", "content script injected");
})();
