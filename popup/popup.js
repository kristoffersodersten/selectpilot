// module_name: popup_popup_ts
// spec_ref: "frontend_state_contract"
import { log } from '../utils/logger.js';
const btn = document.getElementById('open-panel');
const statusEl = document.getElementById('popup-status');
async function injectIntoActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || tab.windowId === undefined)
        throw new Error('No active tab is available');
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content/content-script.bundle.js'],
    });
    await chrome.sidePanel.setOptions({ tabId: tab.id, path: 'panel/panel.html', enabled: true });
    await chrome.sidePanel.open({ windowId: tab.windowId });
}
btn?.addEventListener('click', async () => {
    if (statusEl) {
        statusEl.textContent = '';
        statusEl.hidden = true;
    }
    try {
        await injectIntoActiveTab();
        window.close();
    }
    catch (e) {
        log('popup', 'failed to open side panel', e);
        if (statusEl) {
            statusEl.textContent = 'SelectPilot cannot run on this page. Open a regular webpage and try again.';
            statusEl.hidden = false;
        }
    }
});
