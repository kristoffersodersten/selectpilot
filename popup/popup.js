import { log } from '../utils/logger.js';
const btn = document.getElementById('open-panel');
btn?.addEventListener('click', async () => {
    try {
        await chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
        await chrome.sidePanel.setOptions({ path: 'panel/panel.html', enabled: true });
        window.close();
    }
    catch (e) {
        log('popup', 'failed to open side panel', e);
    }
});
