// module_name: shared_first-run-example_ts
// spec_ref: "frontend_state_contract"
import type { ExtractionPresetKey } from '../panel/extraction-presets.js';

export type FirstRunExample = Readonly<{
  version: string;
  preset: ExtractionPresetKey;
  title: string;
  url: string;
  text: string;
}>;

export const FIRST_RUN_EXAMPLE: FirstRunExample = Object.freeze({
  version: 'v1',
  preset: 'action_brief',
  title: 'Launch review notes',
  url: 'selectpilot://first-run',
  text: 'The launch review is Friday. Maya owns the privacy check by Thursday. Jonas will verify payment and store assets. Publishing stays blocked until both checks pass.',
});
