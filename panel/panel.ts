import { $ } from '../utils/dom.js';
import { getJSON, setJSON } from '../utils/storage.js';
import { endpoints } from '../api/endpoints.js';
import { EXTRACTION_PRESETS, getExtractionPreset, type ExtractionPresetKey } from './extraction-presets.js';
import { getRuntimeProfile, RUNTIME_PROFILES, type RuntimeProfile } from './runtime-profiles.js';
import { buildKnowledgePackage, type KnowledgeTarget, type MemoryLedgerEntry } from './knowledge-connectors.js';

const workflow = $('#workflow');
const exportsEl = $('#exports');
const runtimeStateEl = $('#runtime-state');
const memoryShellEl = $('#memory-shell');
const memoryStatusEl = $('#memory-status');
const memoryMetaEl = $('#memory-meta');
const memoryTargetEl = $('#memory-target') as HTMLSelectElement | null;
const memoryToggleButtonEl = $('#btn-memory-toggle') as HTMLButtonElement | null;
const memoryInspectButtonEl = $('#btn-memory-inspect') as HTMLButtonElement | null;
const memoryExportButtonEl = $('#btn-memory-export') as HTMLButtonElement | null;
const memoryDeleteButtonEl = $('#btn-memory-delete') as HTMLButtonElement | null;
const selectionCardEl = $('#selection-card');
const statusEl = $('#status');
const tierEl = $('#tier');
const statusBar = $('#status-bar');
const refreshButtonEl = $('#btn-refresh') as HTMLButtonElement | null;
const agentPromptEl = $('#agent-prompt') as HTMLTextAreaElement | null;
const extractPresetEl = $('#extract-preset') as HTMLSelectElement | null;
const extractHelpEl = $('#extract-help');
const resultTitleEl = $('#result-title');
const resultMetaEl = $('#result-meta');
const tabReadableEl = $('#tab-readable') as HTMLButtonElement | null;
const tabStructuredEl = $('#tab-structured') as HTMLButtonElement | null;
const truthExecutionEl = $('#truth-execution');
const truthModelEl = $('#truth-model');
const truthBoundaryEl = $('#truth-boundary');
const truthPrivacyEl = $('#truth-privacy');
const truthPrivacyMetaEl = $('#truth-privacy-meta');
const leakageStatusEl = $('#leakage-status');
const leakageDetailsEl = $('#leakage-details');
const truthProfileEl = $('#truth-profile');
const truthLatencyEl = $('#truth-latency');
const actionButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.primary-action, .secondary-grid button, .advanced-grid button'));

type ResultView = 'readable' | 'structured';

type RuntimeSnapshot = {
  ok: boolean;
  reachable: boolean;
  activeModel: string;
  ignoredRemoteCount: number;
  privacyMode: string;
  latencyMs: number | null;
  status: string;
  hint?: string | null;
  error?: string | null;
};

type RuntimeProfilesPayload = {
  profiles: RuntimeProfile[];
  recommended_profile: string;
  reason: string;
  system?: { machine?: string; memory_gb?: number | null; cpu_count?: number | null };
};

type BenchmarkSnapshot = {
  ok: boolean;
  active_model: string;
  extract_latency_ms: number;
  summarize_latency_ms: number;
  recommended_profile: string;
  auto_profile?: string;
  auto_profile_reason?: string;
  benchmarked_at?: number;
};

type PrivacyProofSnapshot = {
  ok: boolean;
  privacy_mode: string;
  generated_at?: string;
  outbound_observation?: {
    external_calls_registered?: boolean;
    statement?: string;
  };
};

type MemoryStatusSnapshot = {
  tier: string;
  supported: boolean;
  enabled: boolean;
  entries: number;
  lastUpdatedAt: number | null;
};

type SelectionPreview = {
  selection: string;
  pageText: string;
  title: string;
  url: string;
  hasSelection: boolean;
};

type RenderedResult = {
  title: string;
  eyebrow: string;
  readable: string;
  structured?: Record<string, unknown>;
  meta: string;
  exportBase: string;
};

let isBusy = false;
let runtimeSnapshot: RuntimeSnapshot = {
  ok: false,
  reachable: false,
  activeModel: 'Unavailable',
  ignoredRemoteCount: 0,
  privacyMode: 'local-only',
  latencyMs: null,
  status: 'checking',
};
let selectionPreview: SelectionPreview = {
  selection: '',
  pageText: '',
  title: '',
  url: '',
  hasSelection: false,
};
let currentResultView: ResultView = 'readable';
let lastResult: RenderedResult | null = null;
let runtimeProfilesPayload: RuntimeProfilesPayload = {
  profiles: RUNTIME_PROFILES,
  recommended_profile: 'fast',
  reason: 'The smallest viable profile is the safest starting point.',
};
let benchmarkSnapshot: BenchmarkSnapshot | null = null;
let privacyProofSnapshot: PrivacyProofSnapshot | null = null;
let memorySnapshot: MemoryStatusSnapshot = {
  tier: 'essential',
  supported: false,
  enabled: false,
  entries: 0,
  lastUpdatedAt: null,
};
const BENCHMARK_CACHE_KEY = 'selectpilot_runtime_benchmark_v1';

const FAST_INSTALL_COMMANDS = [
  'ollama pull qwen2.5:0.5b',
  'ollama pull nomic-embed-text-v2-moe:latest',
  'CHROMEAI_OLLAMA_MODEL=qwen2.5:0.5b ./scripts/install-macos-local.sh',
].join('\n');

const QUICK_SETUP_COMMANDS = [
  'pnpm setup:local',
  'curl http://127.0.0.1:8083/health',
].join('\n');

function setStatus(text: string) {
  if (statusEl) statusEl.textContent = text;
}

function setStatusBar(text: string) {
  if (statusBar) statusBar.textContent = text;
}

function setLeakageFeedback(status: string, details: string) {
  if (leakageStatusEl) leakageStatusEl.textContent = status;
  if (leakageDetailsEl) leakageDetailsEl.textContent = details;
}

function clearNode(node: HTMLElement | null) {
  if (node) node.replaceChildren();
}

function createCard(eyebrow: string, title: string, body: string) {
  const card = document.createElement('div');
  card.className = 'output-card';

  const eyebrowEl = document.createElement('div');
  eyebrowEl.className = 'output-eyebrow';
  eyebrowEl.textContent = eyebrow;

  const titleEl = document.createElement('h3');
  titleEl.textContent = title;

  const pre = document.createElement('pre');
  pre.textContent = body;

  card.append(eyebrowEl, titleEl, pre);
  return card;
}

function shorten(text: string, max = 220): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

function getEfficiencyScore(snapshot: BenchmarkSnapshot | null): number | null {
  if (!snapshot) return null;
  const avgLatency = (snapshot.extract_latency_ms + snapshot.summarize_latency_ms) / 2;
  const score = Math.round(100 - avgLatency / 40);
  return Math.max(0, Math.min(100, score));
}

function formatPrivacyVerifiedAt(iso?: string): string {
  if (!iso) return 'Awaiting proof';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Awaiting proof';
  return `Verified ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function formatMemoryUpdatedAt(timestamp: number | null): string {
  if (!timestamp) return 'No retained events yet.';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'No retained events yet.';
  return `Last updated ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function getEffectiveRecommendedProfileKey(): string {
  return benchmarkSnapshot?.recommended_profile || runtimeProfilesPayload.recommended_profile;
}

function getEffectiveRecommendedProfile() {
  return getRuntimeProfile(getEffectiveRecommendedProfileKey());
}

function getEffectiveRecommendationReason(): string {
  if (!benchmarkSnapshot) return runtimeProfilesPayload.reason;
  const benchmarkProfile = getRuntimeProfile(benchmarkSnapshot.recommended_profile).label;
  const autoProfile = getRuntimeProfile(benchmarkSnapshot.auto_profile || runtimeProfilesPayload.recommended_profile).label;
  if (benchmarkSnapshot.recommended_profile === (benchmarkSnapshot.auto_profile || runtimeProfilesPayload.recommended_profile)) {
    return `Benchmark confirms the ${benchmarkProfile} profile for this workload.`;
  }
  return `Benchmark overrides the hardware heuristic: use ${benchmarkProfile} for this workload instead of the auto ${autoProfile} profile.`;
}

async function loadBenchmarkSnapshot() {
  const cached = await getJSON<BenchmarkSnapshot>(BENCHMARK_CACHE_KEY);
  if (!cached || !cached.recommended_profile) return;
  benchmarkSnapshot = cached;
}

async function persistBenchmarkSnapshot(snapshot: BenchmarkSnapshot | null) {
  if (!snapshot) {
    await chrome.storage.local.remove(BENCHMARK_CACHE_KEY);
    return;
  }
  await setJSON(BENCHMARK_CACHE_KEY, { ...snapshot, benchmarked_at: Date.now() });
}

async function reconcileBenchmarkSnapshot() {
  if (!benchmarkSnapshot || !runtimeSnapshot.ok) return;
  if (benchmarkSnapshot.active_model === runtimeSnapshot.activeModel) return;
  benchmarkSnapshot = null;
  await persistBenchmarkSnapshot(null);
}

function renderResultBody() {
  clearNode(workflow);
  if (!workflow) return;

  if (!lastResult) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<strong>Ready for selected text.</strong><span>Highlight content, then run the primary action to generate structured output locally.</span>';
    workflow.append(empty);
    return;
  }

  if (currentResultView === 'structured' && lastResult.structured && Object.keys(lastResult.structured).length > 0) {
    workflow.append(createCard('Structured output', 'JSON', JSON.stringify(lastResult.structured, null, 2)));
    return;
  }

  workflow.append(createCard(lastResult.eyebrow, lastResult.title, lastResult.readable || 'No output produced.'));
}

function updateResultChrome() {
  const title = lastResult?.title || 'Ready';
  const meta = lastResult?.meta || 'Highlight text to begin.';
  if (resultTitleEl) resultTitleEl.textContent = title;
  if (resultMetaEl) resultMetaEl.textContent = meta;
  if (tabReadableEl) {
    const isReadable = currentResultView === 'readable';
    tabReadableEl.classList.toggle('is-active', isReadable);
    tabReadableEl.setAttribute('aria-selected', String(isReadable));
  }
  const hasStructured = Boolean(lastResult?.structured && Object.keys(lastResult.structured).length > 0);
  if (tabStructuredEl) {
    const isStructured = currentResultView === 'structured';
    tabStructuredEl.classList.toggle('is-active', isStructured);
    tabStructuredEl.setAttribute('aria-selected', String(isStructured));
    tabStructuredEl.disabled = !hasStructured;
  }
}

function renderOutput({
  title,
  eyebrow = 'Output',
  markdown,
  json,
  meta,
  exportBase,
}: {
  title: string;
  eyebrow?: string;
  markdown?: string;
  json?: Record<string, unknown>;
  meta: string;
  exportBase: string;
}) {
  lastResult = {
    title,
    eyebrow,
    readable: markdown || 'No output produced.',
    structured: json && Object.keys(json).length > 0 ? json : undefined,
    meta,
    exportBase,
  };
  currentResultView = 'readable';
  updateResultChrome();
  renderResultBody();
}

function triggerDownload(contents: string, filename: string, mimeType: string) {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function renderExports({
  markdown,
  json,
  basename = 'selectpilot'
}: {
  markdown?: string;
  json?: Record<string, unknown>;
  basename?: string;
}) {
  clearNode(exportsEl);
  if (!exportsEl) return;
  exportsEl.toggleAttribute('hidden', !markdown && !(json && Object.keys(json).length > 0));

  const actions = document.createElement('div');
  actions.className = 'export-actions';

  if (markdown) {
    const copyMarkdown = document.createElement('button');
    copyMarkdown.textContent = 'Copy Markdown';
    copyMarkdown.addEventListener('click', async () => {
      await navigator.clipboard.writeText(markdown);
      setStatus('Markdown copied');
    });
    actions.append(copyMarkdown);

    const downloadMarkdown = document.createElement('button');
    downloadMarkdown.textContent = 'Download .md';
    downloadMarkdown.addEventListener('click', () => {
      triggerDownload(markdown, `${basename}.md`, 'text/markdown');
      setStatus('Markdown downloaded');
    });
    actions.append(downloadMarkdown);
  }

  if (json && Object.keys(json).length > 0) {
    const jsonText = JSON.stringify(json, null, 2);
    const copyJson = document.createElement('button');
    copyJson.textContent = 'Copy JSON';
    copyJson.addEventListener('click', async () => {
      await navigator.clipboard.writeText(jsonText);
      setStatus('JSON copied');
    });
    actions.append(copyJson);

    const downloadJson = document.createElement('button');
    downloadJson.textContent = 'Download .json';
    downloadJson.addEventListener('click', () => {
      triggerDownload(jsonText, `${basename}.json`, 'application/json');
      setStatus('JSON downloaded');
    });
    actions.append(downloadJson);
  }

  exportsEl.append(actions);
}

async function request(type: string, payload: Record<string, unknown> = {}) {
  const res = await chrome.runtime.sendMessage({ type, ...payload });
  if (res?.error) throw new Error(res.error);
  return res;
}

async function fetchHealth() {
  const res = await fetch(endpoints.health, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

async function fetchRuntimeProfiles() {
  const res = await fetch(endpoints.profiles, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Profiles check failed: ${res.status}`);
  return (await res.json()) as RuntimeProfilesPayload;
}

async function runRuntimeBenchmark() {
  const res = await fetch(endpoints.benchmark, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Benchmark failed: ${res.status}`);
  return (await res.json()) as BenchmarkSnapshot;
}

function renderMemoryState() {
  if (!memoryShellEl || !memoryStatusEl || !memoryMetaEl) return;

  const { tier, supported, enabled, entries } = memorySnapshot;
  const plural = entries === 1 ? '' : 's';

  if (!supported) {
    if (tier === 'plus') {
      memoryStatusEl.textContent = 'Memory OFF · Flow tier has connector exports without retention.';
      memoryMetaEl.textContent = 'Upgrade to Deep to enable explicit local retention controls (inspect/export/delete ledger).';
    } else {
      memoryStatusEl.textContent = 'Memory OFF · Core tier is extraction-only and stateless.';
      memoryMetaEl.textContent = 'Upgrade to Flow for connector exports, or Deep for persistent local knowledge.';
    }
  } else if (!enabled) {
    memoryStatusEl.textContent = 'Memory OFF · Deep retention is available but disabled.';
    memoryMetaEl.textContent = 'Enable memory to retain local events. You can inspect, export, and delete at any time.';
  } else {
    memoryStatusEl.textContent = `Memory ON · Deep retention active with ${entries} retained event${plural}.`;
    memoryMetaEl.textContent = `${formatMemoryUpdatedAt(memorySnapshot.lastUpdatedAt)} Inspect/export/delete stays fully local and user-controlled.`;
  }

  if (memoryToggleButtonEl) {
    memoryToggleButtonEl.textContent = enabled ? 'Disable memory' : 'Enable memory';
  }
}

async function refreshMemoryStatus() {
  try {
    memorySnapshot = await request('panel:memory_status');
  } catch {
    memorySnapshot = {
      tier: 'essential',
      supported: false,
      enabled: false,
      entries: 0,
      lastUpdatedAt: null,
    };
  }
  renderMemoryState();
  syncControlAvailability();
}

async function fetchPrivacyProof() {
  const res = await fetch(endpoints.privacyProof, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Privacy proof failed: ${res.status}`);
  return (await res.json()) as PrivacyProofSnapshot;
}

function syncControlAvailability() {
  const runtimeReady = runtimeSnapshot.ok;
  const selectionReady = selectionPreview.hasSelection;
  actionButtons.forEach((button) => {
    const requiresSelection = button.id === 'btn-extract' || button.id === 'btn-actions';
    button.disabled = isBusy || !runtimeReady || (requiresSelection && !selectionReady);
  });
  if (agentPromptEl) agentPromptEl.disabled = isBusy || !runtimeReady;
  if (extractPresetEl) extractPresetEl.disabled = isBusy || !runtimeReady || !selectionReady;
  if (refreshButtonEl) refreshButtonEl.disabled = isBusy;
  if (memoryToggleButtonEl) memoryToggleButtonEl.disabled = isBusy || !memorySnapshot.supported;
  const memoryActionsLocked = isBusy || !memorySnapshot.supported || !memorySnapshot.enabled;
  const flowExportSupported = memorySnapshot.tier !== 'essential';
  const hasTransientExportData = Boolean(lastResult?.readable || (lastResult?.structured && Object.keys(lastResult.structured).length > 0));
  const canExport = memorySnapshot.supported
    ? (memorySnapshot.entries > 0 || hasTransientExportData)
    : hasTransientExportData;
  if (memoryInspectButtonEl) memoryInspectButtonEl.disabled = memoryActionsLocked;
  if (memoryExportButtonEl) memoryExportButtonEl.disabled = isBusy || !flowExportSupported || !canExport;
  if (memoryDeleteButtonEl) memoryDeleteButtonEl.disabled = memoryActionsLocked || memorySnapshot.entries === 0;
}

function populatePresetOptions() {
  if (!extractPresetEl) return;
  clearNode(extractPresetEl);
  for (const preset of EXTRACTION_PRESETS) {
    const option = document.createElement('option');
    option.value = preset.key;
    option.textContent = preset.label;
    extractPresetEl.append(option);
  }
  syncPresetHelp();
}

function syncPresetHelp() {
  const preset = getExtractionPreset(extractPresetEl?.value);
  if (extractHelpEl) extractHelpEl.textContent = preset.description;
}

function buildMetric(label: string, value: string) {
  const metric = document.createElement('div');
  metric.className = 'runtime-metric';
  const kicker = document.createElement('span');
  kicker.className = 'section-kicker';
  kicker.textContent = label;
  const strong = document.createElement('strong');
  strong.textContent = value;
  metric.append(kicker, strong);
  return metric;
}

function createProfileCard(profile: RuntimeProfile, recommendedKey: string, copyLabel = 'Copy command') {
  const card = document.createElement('div');
  card.className = 'profile-card';
  if (profile.key === recommendedKey) card.classList.add('is-recommended');

  const header = document.createElement('div');
  header.className = 'profile-header';

  const title = document.createElement('div');
  title.className = 'profile-title';
  title.textContent = profile.label;

  header.append(title);
  if (profile.key === recommendedKey) {
    const badge = document.createElement('span');
    badge.className = 'profile-badge';
    badge.textContent = 'Recommended';
    header.append(badge);
  }

  const description = document.createElement('p');
  description.className = 'selection-copy';
  description.textContent = profile.description;

  const stack = document.createElement('div');
  stack.className = 'profile-stack';
  stack.append(
    buildMetric('Generation', profile.generation_model),
    buildMetric('Embedding', profile.embedding_model),
    buildMetric('Latency', profile.target_latency),
  );

  const intendedFor = document.createElement('p');
  intendedFor.className = 'selection-copy';
  intendedFor.textContent = profile.intended_for;

  const actions = document.createElement('div');
  actions.className = 'runtime-actions';
  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.textContent = copyLabel;
  copyButton.addEventListener('click', async () => {
    await navigator.clipboard.writeText(profile.command);
    setStatus(`${profile.label} bootstrap command copied`);
  });
  actions.append(copyButton);

  card.append(header, description, stack, intendedFor, actions);
  return card;
}

function renderRuntimeState() {
  clearNode(runtimeStateEl);
  if (!runtimeStateEl) return;

  runtimeStateEl.classList.add('is-visible');
  const profilesGrid = document.createElement('div');
  profilesGrid.className = 'profile-grid';
  const effectiveRecommendedProfileKey = getEffectiveRecommendedProfileKey();
  for (const profile of runtimeProfilesPayload.profiles) {
    profilesGrid.append(createProfileCard(profile, effectiveRecommendedProfileKey));
  }

  if (runtimeSnapshot.ok) {
    const wrapper = document.createElement('div');
    wrapper.className = 'runtime-grid';
    wrapper.append(
      buildMetric('Execution', 'Local-only ready'),
      buildMetric('Provider', 'Ollama on-device'),
      buildMetric('Ignored remote', `${runtimeSnapshot.ignoredRemoteCount} models`),
    );

    const copy = document.createElement('p');
    copy.className = 'runtime-copy';
    copy.textContent = `Runtime ready. ${runtimeSnapshot.activeModel} is active locally, and the selected-text path stays inside the local bridge.`;

    const benchmarkBlock = document.createElement('div');
    benchmarkBlock.className = 'benchmark-block';
    const benchmarkHeader = document.createElement('div');
    benchmarkHeader.className = 'profile-header';
    const benchmarkTitle = document.createElement('div');
    benchmarkTitle.className = 'profile-title';
    benchmarkTitle.textContent = 'Profile fit';
    benchmarkHeader.append(benchmarkTitle);
    benchmarkBlock.append(benchmarkHeader);

    const benchmarkCopy = document.createElement('p');
    benchmarkCopy.className = 'selection-copy';
    if (benchmarkSnapshot) {
      benchmarkCopy.textContent = getEffectiveRecommendationReason();
    } else {
      benchmarkCopy.textContent = 'Run a local benchmark to confirm that the current runtime matches the smallest viable profile for this machine.';
    }
    benchmarkBlock.append(benchmarkCopy);

    const benchmarkMetrics = document.createElement('div');
    benchmarkMetrics.className = 'runtime-grid';
    const efficiencyScore = getEfficiencyScore(benchmarkSnapshot);
    if (benchmarkSnapshot) {
      benchmarkMetrics.append(
        buildMetric('Extract JSON', `${benchmarkSnapshot.extract_latency_ms} ms`),
        buildMetric('Summarize', `${benchmarkSnapshot.summarize_latency_ms} ms`),
        buildMetric('Efficiency', `${efficiencyScore}/100`),
        buildMetric('Recommended', getEffectiveRecommendedProfile().label),
      );
    } else {
      benchmarkMetrics.append(
        buildMetric('Extract JSON', 'Pending'),
        buildMetric('Summarize', 'Pending'),
        buildMetric('Efficiency', 'Pending'),
        buildMetric('Recommended', getEffectiveRecommendedProfile().label),
      );
    }
    benchmarkBlock.append(benchmarkMetrics);

    const benchmarkActions = document.createElement('div');
    benchmarkActions.className = 'runtime-actions';
    const benchmarkButton = document.createElement('button');
    benchmarkButton.type = 'button';
    benchmarkButton.id = 'btn-run-benchmark';
    benchmarkButton.textContent = benchmarkSnapshot ? 'Run benchmark again' : 'Run benchmark';
    benchmarkActions.append(benchmarkButton);
    benchmarkBlock.append(benchmarkActions);

    runtimeStateEl.append(wrapper, copy, benchmarkBlock, profilesGrid);
    return;
  }

  const header = document.createElement('div');
  header.className = 'output-card';
  header.innerHTML = '<div class="output-eyebrow">Human intervention</div><h3>Local runtime not ready</h3>';

  const copy = document.createElement('p');
  copy.className = 'runtime-copy';
  copy.textContent =
    'SelectPilot runs only through local Ollama. Follow these three tiny steps and press re-check when done.';

  const tutorialSteps = document.createElement('div');
  tutorialSteps.className = 'tutorial-steps';

  const stepInstall = document.createElement('div');
  stepInstall.className = 'tutorial-step';
  stepInstall.innerHTML = '<strong>Step 1</strong><span>Copy and run the one-command setup in Terminal.</span>';

  const stepLoad = document.createElement('div');
  stepLoad.className = 'tutorial-step';
  stepLoad.innerHTML = '<strong>Step 2</strong><span>Open chrome://extensions, enable Developer Mode, then Load unpacked.</span>';

  const stepVerify = document.createElement('div');
  stepVerify.className = 'tutorial-step';
  stepVerify.innerHTML = '<strong>Step 3</strong><span>Highlight any text, click Extract JSON, and confirm output appears.</span>';

  tutorialSteps.append(stepInstall, stepLoad, stepVerify);

  const wrapper = document.createElement('div');
  wrapper.className = 'runtime-grid';
  const recommended = getEffectiveRecommendedProfile();
  wrapper.append(
    buildMetric('Recommended profile', recommended.label),
    buildMetric('Generation model', recommended.generation_model),
    buildMetric('Embedding model', recommended.embedding_model),
  );

  const actions = document.createElement('div');
  actions.className = 'runtime-actions';

  const copySetup = document.createElement('button');
  copySetup.type = 'button';
  copySetup.textContent = 'Copy one-command setup';
  copySetup.addEventListener('click', async () => {
    await navigator.clipboard.writeText(QUICK_SETUP_COMMANDS);
    setStatus('One-command setup copied');
  });
  actions.append(copySetup);

  const copyAdvancedSetup = document.createElement('button');
  copyAdvancedSetup.type = 'button';
  copyAdvancedSetup.textContent = 'Copy manual fallback';
  copyAdvancedSetup.addEventListener('click', async () => {
    await navigator.clipboard.writeText(recommended.command || FAST_INSTALL_COMMANDS);
    setStatus('Fallback setup copied');
  });
  actions.append(copyAdvancedSetup);

  const refresh = document.createElement('button');
  refresh.type = 'button';
  refresh.textContent = 'Re-check runtime';
  refresh.addEventListener('click', () => {
    void refreshRuntime();
  });
  actions.append(refresh);

  if (runtimeSnapshot.error || runtimeSnapshot.hint) {
    const note = document.createElement('p');
    note.className = 'runtime-copy';
    note.textContent = runtimeSnapshot.error || runtimeSnapshot.hint || '';
    const reason = document.createElement('p');
    reason.className = 'runtime-copy';
    reason.textContent = getEffectiveRecommendationReason();
    runtimeStateEl.append(header, copy, wrapper, tutorialSteps, actions, reason, profilesGrid, note);
    return;
  }

  const reason = document.createElement('p');
  reason.className = 'runtime-copy';
  reason.textContent = getEffectiveRecommendationReason();
  runtimeStateEl.append(header, copy, wrapper, tutorialSteps, actions, reason, profilesGrid);
}

function renderSelectionState() {
  clearNode(selectionCardEl);
  if (!selectionCardEl) return;

  const header = document.createElement('div');
  header.className = 'output-eyebrow';
  header.textContent = selectionPreview.hasSelection ? 'Active selection' : 'No active selection';

  const title = document.createElement('h3');
  title.textContent = selectionPreview.title || 'Current page';

  const copy = document.createElement('p');
  copy.className = 'selection-copy';
  if (selectionPreview.hasSelection) {
    copy.textContent = shorten(selectionPreview.selection, 260);
  } else if (selectionPreview.pageText) {
    copy.textContent = 'Extract JSON requires highlighted text. Summarize and Ask can still fall back to page context.';
  } else {
    copy.textContent = 'Highlight text on the current page to activate the primary action.';
  }

  const meta = document.createElement('p');
  meta.className = 'selection-copy';
  const charCount = selectionPreview.hasSelection ? selectionPreview.selection.length : selectionPreview.pageText.length;
  meta.textContent = `${selectionPreview.hasSelection ? 'Selection' : 'Page context'} · ${charCount} chars${selectionPreview.url ? ` · ${selectionPreview.url}` : ''}`;

  selectionCardEl.append(header, title, copy, meta);
}

async function refreshSelectionPreview() {
  const preview = await request('panel:get_selection_preview');
  selectionPreview = {
    selection: preview.selection || '',
    pageText: preview.pageText || '',
    title: preview.title || '',
    url: preview.url || '',
    hasSelection: Boolean(preview.hasSelection),
  };
  renderSelectionState();
  syncControlAvailability();
}

async function refreshTier() {
  const res = await request('panel:get_tier');
  if (tierEl) tierEl.textContent = res.tier;
  setStatusBar(`Tier ${res.tier} · checking local runtime`);
}

async function refreshRuntime() {
  const startedAt = performance.now();
  try {
    try {
      runtimeProfilesPayload = await fetchRuntimeProfiles();
    } catch {
      runtimeProfilesPayload = {
        profiles: RUNTIME_PROFILES,
        recommended_profile: 'fast',
        reason: 'The smallest viable profile is the safest starting point.',
      };
    }
    const health = await fetchHealth();
    privacyProofSnapshot = await fetchPrivacyProof();
    runtimeSnapshot = {
      ok: Boolean(health?.ok),
      reachable: Boolean(health?.ollama?.reachable),
      activeModel: health?.ollama?.active_model || 'Unavailable',
      ignoredRemoteCount: Array.isArray(health?.ollama?.ignored_remote_models) ? health.ollama.ignored_remote_models.length : 0,
      privacyMode: health?.ollama?.privacy_mode || 'local-only',
      latencyMs: Math.round(performance.now() - startedAt),
      status: health?.ollama?.status || 'ok',
      hint: health?.ollama?.hint || null,
      error: null,
    };
    if (truthExecutionEl) truthExecutionEl.textContent = runtimeSnapshot.ok ? 'Local' : 'Degraded';
    if (truthModelEl) truthModelEl.textContent = runtimeSnapshot.activeModel;
    if (truthBoundaryEl) truthBoundaryEl.textContent = runtimeSnapshot.privacyMode === 'local-only' ? 'Selected text stays local' : runtimeSnapshot.privacyMode;
    if (truthPrivacyEl) {
      const localOnly = Boolean(privacyProofSnapshot?.ok) && !Boolean(privacyProofSnapshot?.outbound_observation?.external_calls_registered);
      truthPrivacyEl.textContent = localOnly ? 'Verified local-only' : 'Boundary degraded';
      setLeakageFeedback(
        localOnly ? 'No leakage detected' : 'Potential leakage detected',
        localOnly
          ? 'Core selected-text execution is verified local through Ollama on-device.'
          : (privacyProofSnapshot?.outbound_observation?.statement || 'External target observed. Inspect privacy-proof details.')
      );
    }
    if (truthPrivacyMetaEl) truthPrivacyMetaEl.textContent = formatPrivacyVerifiedAt(privacyProofSnapshot?.generated_at);
    if (truthProfileEl) truthProfileEl.textContent = getEffectiveRecommendedProfile().label;
    if (truthLatencyEl) truthLatencyEl.textContent = runtimeSnapshot.latencyMs ? `${runtimeSnapshot.latencyMs} ms` : 'Measured';
    setStatusBar(
      runtimeSnapshot.ok
        ? `${runtimeSnapshot.activeModel} ready in local Ollama · ${runtimeSnapshot.ignoredRemoteCount} remote models ignored`
        : `Runtime degraded · ${runtimeSnapshot.hint || 'local model required'}`
    );
    await reconcileBenchmarkSnapshot();
    renderRuntimeState();
  } catch (e: any) {
    runtimeProfilesPayload = {
      profiles: RUNTIME_PROFILES,
      recommended_profile: 'fast',
      reason: 'The runtime is unavailable, so the smallest viable profile is the safest starting point.',
    };
    benchmarkSnapshot = null;
    runtimeSnapshot = {
      ok: false,
      reachable: false,
      activeModel: 'Unavailable',
      ignoredRemoteCount: 0,
      privacyMode: 'local-only',
      latencyMs: null,
      status: 'offline',
      hint: 'Install a local Ollama runtime and the Fast profile, then refresh.',
      error: e?.message || 'Ollama health check failed',
    };
    if (truthExecutionEl) truthExecutionEl.textContent = 'Offline';
    if (truthModelEl) truthModelEl.textContent = 'Unavailable';
    if (truthBoundaryEl) truthBoundaryEl.textContent = 'Local-only pending';
    if (truthPrivacyEl) truthPrivacyEl.textContent = 'Unavailable';
    if (truthPrivacyMetaEl) truthPrivacyMetaEl.textContent = 'Awaiting proof';
    setLeakageFeedback('No leakage proof unavailable', 'Runtime is offline, so leakage verification has not been completed yet.');
    if (truthProfileEl) truthProfileEl.textContent = getEffectiveRecommendedProfile().label;
    if (truthLatencyEl) truthLatencyEl.textContent = 'Unavailable';
    setStatusBar(`Local runtime unavailable · setup required`);
    setStatus(runtimeSnapshot.error || 'Ollama health check failed');
    renderRuntimeState();
  }
  syncControlAvailability();
}

async function doSummarize() {
  setStatus('Summarizing selected text...');
  const res = await request('panel:summarize');
  renderOutput({
    title: 'Summary',
    markdown: res.markdown || res.summary || '',
    eyebrow: 'Selected text',
    meta: 'Human-friendly summary generated locally from the active browser context.',
    exportBase: 'selectpilot-summary',
  });
  renderExports({ markdown: res.markdown || res.summary || '', basename: 'selectpilot-summary' });
  setStatus('Done');
}

async function doExtract(presetKey?: ExtractionPresetKey) {
  const selectedPreset = getExtractionPreset(presetKey || extractPresetEl?.value);
  setStatus(`Extracting ${selectedPreset.label.toLowerCase()}...`);
  const res = await request('panel:extract', { preset: selectedPreset.key });
  renderOutput({
    title: res.label || selectedPreset.label,
    markdown: res.markdown || '',
    json: res.json || {},
    eyebrow: 'Structured extraction',
    meta: `${res.description || selectedPreset.description} This is the reusable local execution path.`,
    exportBase: `selectpilot-${selectedPreset.key}`,
  });
  renderExports({ markdown: res.markdown, json: res.json, basename: `selectpilot-${selectedPreset.key}` });
  setStatus('Done');
}

async function doRewrite() {
  const prompt = agentPromptEl?.value.trim() || 'Rewrite the selected text in clearer, tighter language.';
  setStatus('Rewriting...');
  const res = await request('panel:agent', { prompt });
  const markdown = res.markdown || '';
  renderOutput({
    title: 'Rewrite',
    markdown,
    json: res.json || {},
    eyebrow: 'Prompted transform',
    meta: 'Freeform local transform using the current custom prompt.',
    exportBase: 'selectpilot-rewrite',
  });
  renderExports({ markdown, json: res.json || {}, basename: 'selectpilot-rewrite' });
  setStatus('Done');
}

async function doActions() {
  await doExtract('action_brief');
}

async function doAsk() {
  const prompt = agentPromptEl?.value.trim() || 'Answer the question using the selected text as context.';
  setStatus('Asking Ollama...');
  const res = await request('panel:agent', { prompt });
  const markdown = res.markdown || '';
  renderOutput({
    title: 'Answer',
    markdown,
    json: res.json || {},
    eyebrow: 'Local model',
    meta: 'General-purpose local answer using the selected text as context.',
    exportBase: 'selectpilot-answer',
  });
  renderExports({ markdown, json: res.json || {}, basename: 'selectpilot-answer' });
  setStatus('Done');
}

async function doBenchmark() {
  setStatus('Benchmarking local runtime...');
  benchmarkSnapshot = await runRuntimeBenchmark();
  await persistBenchmarkSnapshot(benchmarkSnapshot);
  if (truthProfileEl) truthProfileEl.textContent = getEffectiveRecommendedProfile().label;
  if (truthLatencyEl) truthLatencyEl.textContent = `${benchmarkSnapshot.extract_latency_ms} ms`;
  renderRuntimeState();
  setStatus('Benchmark complete');
}

async function doMemoryToggle() {
  memorySnapshot = await request('panel:memory_toggle');
  renderMemoryState();
  syncControlAvailability();
  setStatus(memorySnapshot.enabled ? 'Deep memory enabled' : 'Deep memory disabled');
}

async function doMemoryInspect() {
  const res = await request('panel:memory_inspect');
  const entries = Array.isArray(res?.entries) ? res.entries : [];
  renderOutput({
    title: 'Memory ledger',
    eyebrow: 'Deep retention',
    markdown: entries.length ? `Retained local events: ${entries.length}` : 'No retained local events yet.',
    json: { entries },
    meta: 'Local-only retained event ledger (inspectable/exportable/deletable).',
    exportBase: 'selectpilot-memory-ledger',
  });
  renderExports({ json: { entries }, basename: 'selectpilot-memory-ledger' });
  setStatus('Memory ledger loaded');
}

async function doMemoryExport() {
  if (memorySnapshot.tier === 'essential') {
    throw new Error('Flow tier required for connector exports');
  }

  const target = (memoryTargetEl?.value as KnowledgeTarget) || 'generic';
  let entries: MemoryLedgerEntry[] = [];

  if (memorySnapshot.supported && memorySnapshot.enabled) {
    const res = await request('panel:memory_inspect');
    entries = (Array.isArray(res?.entries) ? res.entries : []) as MemoryLedgerEntry[];
  } else if (lastResult) {
    const inferredAction: MemoryLedgerEntry['action'] =
      lastResult.title.toLowerCase().includes('summary')
        ? 'summarize'
        : lastResult.title.toLowerCase().includes('extract') || lastResult.title.toLowerCase().includes('action')
          ? 'extract'
          : 'agent';
    entries = [{
      action: inferredAction,
      content: selectionPreview.selection || selectionPreview.pageText || '',
      summary: lastResult.readable || '',
      url: selectionPreview.url || undefined,
      title: selectionPreview.title || lastResult.title,
      sourceType: selectionPreview.url ? (selectionPreview.url.toLowerCase().includes('.pdf') ? 'pdf' : 'web') : 'text',
      sourceOrigin: selectionPreview.url || 'local-context',
      sourceTimestamp: new Date().toISOString(),
      intent: inferredAction === 'extract' ? 'task' : inferredAction === 'agent' ? 'insight' : 'reference',
      tags: ['flow-export', 'local-only'],
      charCount: (selectionPreview.selection || selectionPreview.pageText || '').length,
      createdAt: Date.now(),
    }];
  }

  if (!entries.length) {
    throw new Error('No exportable knowledge available yet. Run an extraction, summary, or ask first.');
  }

  const payload = buildKnowledgePackage(target, entries);
  const filename = `selectpilot-knowledge-${target}-${Date.now()}.json`;
  triggerDownload(JSON.stringify(payload, null, 2), filename, 'application/json');
  setStatus(`Knowledge package exported (${target})`);
}

async function doMemoryDelete() {
  memorySnapshot = await request('panel:memory_delete');
  renderMemoryState();
  syncControlAvailability();
  setStatus('Memory ledger deleted');
}

function bindActions() {
  const wrap = (fn: () => Promise<void>) => async () => {
    isBusy = true;
    syncControlAvailability();
    try {
      await fn();
    } catch (e: any) {
      setStatus(e?.message || 'Request failed');
    } finally {
      isBusy = false;
      syncControlAvailability();
      void Promise.all([refreshSelectionPreview(), refreshMemoryStatus()]);
    }
  };

  refreshButtonEl?.addEventListener('click', () => {
    void Promise.all([refreshRuntime(), refreshSelectionPreview(), refreshMemoryStatus()]);
  });
  $('#btn-extract')?.addEventListener('click', wrap(() => doExtract()));
  $('#btn-summarize')?.addEventListener('click', wrap(() => doSummarize()));
  $('#btn-rewrite')?.addEventListener('click', wrap(() => doRewrite()));
  $('#btn-actions')?.addEventListener('click', wrap(() => doActions()));
  $('#btn-ask')?.addEventListener('click', wrap(() => doAsk()));
  memoryToggleButtonEl?.addEventListener('click', wrap(() => doMemoryToggle()));
  memoryInspectButtonEl?.addEventListener('click', wrap(() => doMemoryInspect()));
  memoryExportButtonEl?.addEventListener('click', wrap(() => doMemoryExport()));
  memoryDeleteButtonEl?.addEventListener('click', wrap(() => doMemoryDelete()));
  $('#btn-transcribe')?.addEventListener('click', () =>
    wrap(async () => {
      const res = await request('panel:transcribe');
      renderOutput({
        title: 'Transcription',
        markdown: res.text || '',
        eyebrow: 'Advanced',
        meta: 'Experimental audio path.',
        exportBase: 'selectpilot-transcript',
      });
      renderExports({ markdown: res.text || '', basename: 'selectpilot-transcript' });
      setStatus('Done');
    })()
  );
  $('#btn-vision')?.addEventListener('click', () =>
    wrap(async () => {
      const res = await request('panel:vision');
      renderOutput({
        title: 'Vision',
        markdown: res.text || '',
        eyebrow: 'Advanced',
        meta: 'Experimental OCR / image signature path.',
        exportBase: 'selectpilot-vision',
      });
      renderExports({ markdown: res.text || '', basename: 'selectpilot-vision' });
      setStatus('Done');
    })()
  );
  extractPresetEl?.addEventListener('change', () => syncPresetHelp());
  runtimeStateEl?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.id === 'btn-run-benchmark') {
      void wrap(() => doBenchmark())();
    }
  });
  tabReadableEl?.addEventListener('click', () => {
    currentResultView = 'readable';
    updateResultChrome();
    renderResultBody();
  });
  tabStructuredEl?.addEventListener('click', () => {
    if (!lastResult?.structured) return;
    currentResultView = 'structured';
    updateResultChrome();
    renderResultBody();
  });
  window.addEventListener('focus', () => {
    void Promise.all([refreshRuntime(), refreshSelectionPreview(), refreshMemoryStatus()]);
  });
}

populatePresetOptions();
bindActions();

async function initialize() {
  await loadBenchmarkSnapshot();
  renderMemoryState();
  refreshTier();
  renderRuntimeState();
  renderSelectionState();
  updateResultChrome();
  renderResultBody();
  renderExports({});
  await Promise.all([refreshRuntime(), refreshSelectionPreview(), refreshMemoryStatus()]);
}

void initialize();
