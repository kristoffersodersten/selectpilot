export type ExtractionPresetKey = 'action_brief' | 'generic_json' | 'job_brief' | 'decision_log';

export type ExtractionPreset = {
  key: ExtractionPresetKey;
  label: string;
  description: string;
};

export const EXTRACTION_PRESETS: ExtractionPreset[] = [
  {
    key: 'action_brief',
    label: 'Action Brief',
    description: 'Turn selected text into summary, actions, decisions, risks, and follow-ups.'
  },
  {
    key: 'generic_json',
    label: 'Generic JSON',
    description: 'Create reusable JSON with key points, entities, actions, and open questions.'
  },
  {
    key: 'job_brief',
    label: 'Job Brief',
    description: 'Extract a structured hiring brief from a job post or role description.'
  },
  {
    key: 'decision_log',
    label: 'Decision Log',
    description: 'Capture the decision, rationale, risks, open questions, and next steps.'
  }
];

export function getExtractionPreset(key: string | null | undefined): ExtractionPreset {
  return EXTRACTION_PRESETS.find((preset) => preset.key === key) || EXTRACTION_PRESETS[0];
}
