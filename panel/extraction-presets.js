import { DEFAULT_EXTRACTION_PRESET, EXTRACTION_PRESET_DEFINITIONS } from './extraction-presets.generated.js';
export const EXTRACTION_PRESETS = EXTRACTION_PRESET_DEFINITIONS.map(({ key, label, description }) => ({
    key,
    label,
    description,
}));
export function getExtractionPreset(key) {
    const resolvedKey = key ?? DEFAULT_EXTRACTION_PRESET;
    const preset = EXTRACTION_PRESETS.find((candidate) => candidate.key === resolvedKey);
    if (!preset)
        throw new Error(`Unknown extraction preset: ${resolvedKey}`);
    return preset;
}
