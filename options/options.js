const defaults = { controlSide: 'right', resultView: 'readable', reduceMotion: false, highContrast: false, textSize: 'standard' };
const fields = {
    controlSide: document.querySelector('#control-side'),
    resultView: document.querySelector('#result-view'),
    reduceMotion: document.querySelector('#reduce-motion'),
    highContrast: document.querySelector('#high-contrast'),
    textSize: document.querySelector('#text-size'),
};
const statusMessage = document.querySelector('#status');
async function load() {
    const stored = await chrome.storage.sync.get('selectpilot_settings');
    const settings = { ...defaults, ...(stored.selectpilot_settings || {}) };
    fields.controlSide.value = settings.controlSide;
    fields.resultView.value = settings.resultView;
    fields.reduceMotion.checked = settings.reduceMotion;
    fields.highContrast.checked = settings.highContrast;
    fields.textSize.value = settings.textSize;
}
async function save() {
    const settings = {
        controlSide: fields.controlSide.value,
        resultView: fields.resultView.value,
        reduceMotion: fields.reduceMotion.checked,
        highContrast: fields.highContrast.checked,
        textSize: fields.textSize.value,
    };
    await chrome.storage.sync.set({ selectpilot_settings: settings });
    if (statusMessage)
        statusMessage.textContent = 'Saved.';
}
Object.values(fields).forEach((field) => field?.addEventListener('change', () => void save()));
document.querySelector('#shortcuts')?.addEventListener('click', () => void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));
document.querySelector('#downloads')?.addEventListener('click', () => void chrome.tabs.create({ url: 'chrome://settings/downloads' }));
void load();
export {};
