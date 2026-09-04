// module_name: content_content-script_ts
// spec_ref: "execution_layer"
import { extractSelection } from './extract-text.js';
import { log } from '../utils/logger.js';
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
        const response = {};
        if (msg.type === 'content:get_selection') {
            response.text = extractSelection();
        }
        sendResponse(response);
    })();
    return true;
});
log('content', 'content script injected');
