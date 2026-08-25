// module_name: popup_popup_ts
// spec_ref: "frontend_state_contract"
import { log } from '../utils/logger.js';
const btn = document.getElementById('open-panel');
async function injectIntoActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id)
        throw new Error('No active tab is available');
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content/content-script.bundle.js'],
    });
}
btn?.addEventListener('click', async () => {
    try {
        await injectIntoActiveTab();
        await chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
        await chrome.sidePanel.setOptions({ path: 'panel/panel.html', enabled: true });
        window.close();
    }
    catch (e) {
        log('popup', 'failed to open side panel', e);
    }
});
