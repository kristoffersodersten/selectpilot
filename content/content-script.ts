// module_name: content_content-script_ts
// spec_ref: "execution_layer"
import { extractSelection } from './extract-text.js';
import { log } from '../utils/logger.js';

type Message = { type: 'content:get_selection' };

type Response = {
  text?: ReturnType<typeof extractSelection>;
};

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  (async () => {
    const response: Response = {};
    if (msg.type === 'content:get_selection') {
      response.text = extractSelection();
    }
    sendResponse(response);
  })();
  return true;
});

log('content', 'content script injected');
