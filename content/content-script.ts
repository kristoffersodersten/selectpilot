import { extractSelection, extractDocumentText } from './extract-text.js';
import { extractAudio } from './extract-audio.js';
import { extractVideo } from './extract-video.js';
import { log } from '../utils/logger.js';

type Message =
  | { type: 'content:get_selection' }
  | { type: 'content:get_document' }
  | { type: 'content:get_audio' }
  | { type: 'content:get_video' };

type Response = {
  text?: ReturnType<typeof extractSelection>;
  documentText?: ReturnType<typeof extractDocumentText>;
  audio?: Awaited<ReturnType<typeof extractAudio>>;
  video?: Awaited<ReturnType<typeof extractVideo>>;
};

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  (async () => {
    const response: Response = {};
    if (msg.type === 'content:get_selection') {
      response.text = extractSelection();
    }
    if (msg.type === 'content:get_document') {
      response.documentText = extractDocumentText();
    }
    if (msg.type === 'content:get_audio') {
      response.audio = extractAudio();
    }
    if (msg.type === 'content:get_video') {
      response.video = await extractVideo();
    }
    sendResponse(response);
  })();
  return true;
});

log('content', 'content script injected');
