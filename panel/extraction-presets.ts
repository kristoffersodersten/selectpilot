// module_name: panel_extraction-presets_ts
// spec_ref: "frontend_state_contract"
import { DEFAULT_EXTRACTION_PRESET, EXTRACTION_PRESET_DEFINITIONS } from './extraction-presets.generated.js';

export type ExtractionPresetKey = string;

export type ExtractionPreset = {
  key: ExtractionPresetKey;
  label: string;
  description: string;
};

export const EXTRACTION_PRESETS: ExtractionPreset[] = EXTRACTION_PRESET_DEFINITIONS.map(({ key, label, description }) => ({
  key,
  label,
  description,
}));

// @spec_ref frontend_state_contract
export function getExtractionPreset(key: string | null | undefined): ExtractionPreset {
  const resolvedKey = key ?? DEFAULT_EXTRACTION_PRESET;
  const preset = EXTRACTION_PRESETS.find((candidate) => candidate.key === resolvedKey);
  if (!preset) throw new Error(`Unknown extraction preset: ${resolvedKey}`);
  return preset;
}
