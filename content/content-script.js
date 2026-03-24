import { extractSelection, extractDocumentText } from './extract-text.js';
import { extractAudio } from './extract-audio.js';
import { extractVideo } from './extract-video.js';
import { log } from '../utils/logger.js';
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
        const response = {};
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
