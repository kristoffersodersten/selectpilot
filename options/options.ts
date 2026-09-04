// module_name: extension_settings
// spec_ref: "runtime_profiles"
export {};

type Settings = {
  controlSide: 'left' | 'right';
  resultView: 'readable' | 'structured';
  reduceMotion: boolean;
  highContrast: boolean;
  textSize: 'standard' | 'large' | 'larger';
};

const defaults: Settings = { controlSide: 'right', resultView: 'readable', reduceMotion: false, highContrast: false, textSize: 'standard' };
const fields = {
  controlSide: document.querySelector<HTMLSelectElement>('#control-side'),
  resultView: document.querySelector<HTMLSelectElement>('#result-view'),
  reduceMotion: document.querySelector<HTMLInputElement>('#reduce-motion'),
  highContrast: document.querySelector<HTMLInputElement>('#high-contrast'),
  textSize: document.querySelector<HTMLSelectElement>('#text-size'),
};
const statusMessage = document.querySelector('#status');

async function load() {
  const stored = await chrome.storage.local.get('selectpilot_settings');
  const settings = { ...defaults, ...(stored.selectpilot_settings || {}) } as Settings;
  fields.controlSide!.value = settings.controlSide;
  fields.resultView!.value = settings.resultView;
  fields.reduceMotion!.checked = settings.reduceMotion;
  fields.highContrast!.checked = settings.highContrast;
  fields.textSize!.value = settings.textSize;
}

async function save() {
  const settings: Settings = {
    controlSide: fields.controlSide!.value as Settings['controlSide'],
    resultView: fields.resultView!.value as Settings['resultView'],
    reduceMotion: fields.reduceMotion!.checked,
    highContrast: fields.highContrast!.checked,
    textSize: fields.textSize!.value as Settings['textSize'],
  };
  await chrome.storage.local.set({ selectpilot_settings: settings });
  if (statusMessage) statusMessage.textContent = 'Saved.';
}

Object.values(fields).forEach((field) => field?.addEventListener('change', () => void save()));
document.querySelector('#shortcuts')?.addEventListener('click', () => void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));
document.querySelector('#downloads')?.addEventListener('click', () => void chrome.tabs.create({ url: 'chrome://settings/downloads' }));
void load();
