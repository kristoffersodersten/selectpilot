#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const scriptDir = decodeURIComponent(path.dirname(new URL(import.meta.url).pathname));
const REPO_ROOT = path.resolve(scriptDir, '..');
const TOKENS_PATH = path.resolve(REPO_ROOT, 'shared/tokens/uiTokens.json');
const LAYOUT_RULES_PATH = path.resolve(REPO_ROOT, 'panel/layout/layoutRules.ts');
const TOPOLOGY_MAP_PATH = path.resolve(REPO_ROOT, 'panel/layout/topologyMap.ts');
const RUNTIME_STORE_PATH = path.resolve(REPO_ROOT, 'panel/state/runtimeStore.ts');
const PANEL_HTML_PATH = path.resolve(REPO_ROOT, 'panel/panel.html');
const PANEL_CSS_PATH = path.resolve(REPO_ROOT, 'panel/panel.css');
const OUTPUT_PATH = path.resolve(REPO_ROOT, 'reports/ui_contract_validation.json');

const REQUIRED_HARD_RULE = 'if_feature_fails_any_required_fat_dimension_it_must_not_enter_runtime_ui';

async function readText(filePath) {
  return fs.readFile(filePath, 'utf8');
}

function parseNumericConstant(source, name) {
  const regex = new RegExp(`export\\s+const\\s+${name}\\s*=\\s*(\\d+)`, 'm');
  const match = source.match(regex);
  return match ? Number(match[1]) : null;
}

function parseTopologyMap(source) {
  const blockMatch = source.match(/TOPOLOGY_MAP\s*:\s*Record<[^>]+>\s*=\s*\{([\s\S]*?)\};/m);
  if (!blockMatch) return {};
  const mapBody = blockMatch[1];
  const entries = [...mapBody.matchAll(/\s*([a-z_]+)\s*:\s*'([a-z_]+)'\s*,?/g)];
  return Object.fromEntries(entries.map((m) => [m[1], m[2]]));
}

function reportDimension(name, passed, errors = [], evidence = {}) {
  return { name, passed, errors, evidence };
}

function selectorExists(html, selector) {
  if (selector.startsWith('#')) {
    const id = selector.slice(1);
    return new RegExp(`id=["']${id}["']`).test(html);
  }
  if (selector.startsWith('.')) {
    const cls = selector.slice(1);
    return new RegExp(`class=["'][^"']*\\b${cls}\\b[^"']*["']`).test(html);
  }
  return false;
}

async function main() {
  const [tokensRaw, layoutSource, topologySource, runtimeStoreSource, panelHtml, panelCss] = await Promise.all([
    readText(TOKENS_PATH),
    readText(LAYOUT_RULES_PATH),
    readText(TOPOLOGY_MAP_PATH),
    readText(RUNTIME_STORE_PATH),
    readText(PANEL_HTML_PATH),
    readText(PANEL_CSS_PATH),
  ]);

  const tokens = JSON.parse(tokensRaw);
  const dimensions = [];

  const tokenErrors = [];
  if (tokens.hard_rule !== REQUIRED_HARD_RULE) tokenErrors.push('invalid_hard_rule');
  if (!Array.isArray(tokens.required_fat_dimensions)) tokenErrors.push('missing_required_fat_dimensions');
  else {
    for (const required of ['layout_contract', 'topology_contract', 'token_contract']) {
      if (!tokens.required_fat_dimensions.includes(required)) tokenErrors.push(`missing_required_dimension:${required}`);
    }
  }
  dimensions.push(reportDimension('token_contract', tokenErrors.length === 0, tokenErrors, {
    schema_version: tokens.schema_version || null,
  }));

  const layoutErrors = [];
  const checks = [
    ['BASE_GRID', tokens.layout?.base_grid],
    ['SUB_GRID', tokens.layout?.sub_grid],
    ['MAX_VISIBLE_PANELS', tokens.layout?.max_visible_panels],
    ['MAX_VISIBLE_STATES', tokens.layout?.max_visible_states],
    ['BREAKPOINT_SINGLE_COLUMN', tokens.layout?.breakpoint_single_column],
    ['PANEL_GAP', tokens.layout?.panel_gap],
    ['PANEL_PADDING', tokens.layout?.panel_padding],
    ['PANEL_RADIUS', tokens.layout?.panel_radius],
  ];
  for (const [constantName, tokenValue] of checks) {
    const found = parseNumericConstant(layoutSource, constantName);
    if (found === null) layoutErrors.push(`missing_layout_constant:${constantName}`);
    else if (Number(tokenValue) !== found) layoutErrors.push(`layout_mismatch:${constantName}:${tokenValue}!=${found}`);
  }
  dimensions.push(reportDimension('layout_contract', layoutErrors.length === 0, layoutErrors, {
    validated_constants: checks.map(([name]) => name),
  }));

  const topologyErrors = [];
  const topologyMap = parseTopologyMap(topologySource);
  const requiredTopology = {
    panel_header: '.panel-header',
    runtime_meta_overlay: '#runtime-meta-overlay',
    truth_strip: '.truth-strip',
    runtime_state: '#runtime-state',
    selection_shell: '#selection-shell',
    intent_shell: '.intent-shell',
    workspace: '.workspace',
    result_shell: '.result-shell',
    memory_shell: '.memory-shell',
    status_footer: '.status-footer',
  };

  for (const [componentId, selector] of Object.entries(requiredTopology)) {
    if (!topologyMap[componentId]) topologyErrors.push(`missing_topology_mapping:${componentId}`);
    if (!selectorExists(panelHtml, selector)) topologyErrors.push(`missing_panel_selector:${componentId}:${selector}`);
  }
  dimensions.push(reportDimension('topology_contract', topologyErrors.length === 0, topologyErrors, {
    mapped_components: Object.keys(topologyMap).length,
  }));

  const runtimeUiErrors = [];
  const maxVisiblePanels = parseNumericConstant(layoutSource, 'MAX_VISIBLE_PANELS');
  const runtimeStoreMaxMatch = runtimeStoreSource.match(/const\s+MAX_VISIBLE_PANELS\s*=\s*(\d+)/m);
  const runtimeStoreMax = runtimeStoreMaxMatch ? Number(runtimeStoreMaxMatch[1]) : null;
  if (maxVisiblePanels === null) runtimeUiErrors.push('missing_layout_max_visible_panels');
  if (runtimeStoreMax === null) runtimeUiErrors.push('missing_runtime_store_max_visible_panels');
  if (runtimeStoreMax !== null && maxVisiblePanels !== null && runtimeStoreMax !== maxVisiblePanels) {
    runtimeUiErrors.push(`max_visible_panels_mismatch:${runtimeStoreMax}!=${maxVisiblePanels}`);
  }
  if (!runtimeStoreSource.includes('slice(0, MAX_VISIBLE_PANELS)')) runtimeUiErrors.push('runtime_store_does_not_enforce_visible_panel_cap');

  const motionContractErrors = [];
  if (!panelCss.includes('120ms')) motionContractErrors.push('missing_quick_motion_duration_120ms');
  if (!panelCss.includes('160ms')) motionContractErrors.push('missing_standard_motion_duration_160ms');
  if (!panelCss.includes('ease')) motionContractErrors.push('missing_standard_easing');

  const dimensionsPassed = dimensions.every((d) => d.passed);
  const runtimeUiEligible = dimensionsPassed && runtimeUiErrors.length === 0 && motionContractErrors.length === 0;

  const output = {
    generated_at: new Date().toISOString(),
    validator: 'ui_contract_validator',
    type: 'strict_file_contract_and_mue_ui_governance',
    hard_rule: REQUIRED_HARD_RULE,
    dimensions,
    runtime_ui_gate: {
      passed: runtimeUiEligible,
      errors: [...runtimeUiErrors, ...motionContractErrors],
      required_fat_dimensions: tokens.required_fat_dimensions || [],
    },
    pixel_perfection_validation_report: {
      passed: motionContractErrors.length === 0,
      errors: motionContractErrors,
      tokens_checked: ['motion.duration_ms.quick', 'motion.duration_ms.standard', 'motion.easing.standard'],
    },
    ok: runtimeUiEligible,
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  if (!output.ok) {
    console.error(JSON.stringify({ ok: false, output_path: path.relative(REPO_ROOT, OUTPUT_PATH), errors: output.runtime_ui_gate.errors }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({ ok: true, output_path: path.relative(REPO_ROOT, OUTPUT_PATH) }, null, 2));
}

main().catch(async (error) => {
  const failure = {
    generated_at: new Date().toISOString(),
    validator: 'ui_contract_validator',
    ok: false,
    error: String(error?.message || error),
  };
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(failure, null, 2)}\n`, 'utf8');
  console.error(JSON.stringify(failure, null, 2));
  process.exit(1);
});
