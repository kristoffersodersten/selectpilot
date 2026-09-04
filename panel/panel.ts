// module_name: panel_surface
// spec_ref: "intent_popup"
// @spec_ref observability_layer
// @spec_ref probabilistic_suggestion_engine
import { $ } from '../utils/dom.js';
import { getJSON, setJSON } from '../utils/storage.js';
import { endpoints } from '../api/endpoints.js';
import { getRuntimeMetaHealth, getRuntimeMetaStreamUrl, type RuntimeMetaEvent, type IntentCompileResponse } from '../api/nano-client.js';
import { EXTRACTION_PRESETS, getExtractionPreset, type ExtractionPresetKey } from './extraction-presets.js';
import { getRuntimeProfile, RUNTIME_PROFILES, type RuntimeProfile } from './runtime-profiles.js';
import { buildKnowledgePackage, type KnowledgeTarget, type MemoryLedgerEntry } from './knowledge-connectors.js';
import { applyRuntimeEvent, setIntent, setSelectionContext, setVisiblePanels } from './state/runtimeStore.js';
import { loadBottleneckReport, loadDeterminismReport, loadFrontierReport } from './state/reportStore.js';
import { getTopologyForComponent, validateTopologyMap } from './layout/topologyMap.js';
import { FIRST_RUN_EXAMPLE } from '../shared/first-run-example.js';

const workflow = $('#workflow');
const exportsEl = $('#exports');
const runtimeStateEl = $('#runtime-state');
const memoryShellEl = $('#memory-shell');
const memoryStatusEl = $('#memory-status');
const memoryMetaEl = $('#memory-meta');
const memoryTargetEl = $('#memory-target') as HTMLSelectElement | null;
const licenseTokenInputEl = $('#license-token') as HTMLInputElement | null;
const attachLicenseButtonEl = $('#btn-attach-license') as HTMLButtonElement | null;
const startTrialButtonEl = $('#btn-start-trial') as HTMLButtonElement | null;
const viewPlansButtonEl = $('#btn-view-plans') as HTMLButtonElement | null;
const entitlementStatusEl = $('#entitlement-status');
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
const intentInputEl = $('#intent-input') as HTMLInputElement | null;
const intentSuggestionsEl = $('#intent-suggestions');
const intentExecuteButtonEl = $('#btn-intent-execute') as HTMLButtonElement | null;
const intentClearButtonEl = $('#btn-intent-clear') as HTMLButtonElement | null;
const runtimeMetaOverlayEl = $('#runtime-meta-overlay');
const runtimeMetaStatusEl = $('#runtime-meta-status');
const runtimeMetaConnectionEl = $('#runtime-meta-connection');
const runtimeMetaSummaryEl = $('#runtime-meta-summary');
const runtimeMetaProgressBarEl = $('#runtime-meta-progress-bar');
const runtimeMetaOperationEl = $('#runtime-meta-operation');
const runtimeMetaStepEl = $('#runtime-meta-step');
const runtimeMetaTraceEl = $('#runtime-meta-trace');
const runtimeMetaEventsEl = $('#runtime-meta-events') as HTMLUListElement | null;
const resultShellEl = $('#result-shell');
const processingFieldEl = $('#processing-field');
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

type EntitlementSnapshot = {
  token?: string;
  tier?: string;
  expiresAt?: number;
  cachedAt?: number;
  features?: string[];
} | null;

const ENTITLEMENT_FRESH_MS = 15 * 60 * 1000;
const FIRST_RUN_COMPLETED_KEY = 'selectpilot_first_run_completed_v1';

type SelectionPreview = {
  selection: string;
  pageText: string;
  title: string;
  url: string;
  hasSelection: boolean;
  pageColor?: string;
};

type RenderedResult = {
  title: string;
  eyebrow: string;
  readable: string;
  structured?: Record<string, unknown>;
  meta: string;
  exportBase: string;
};

type RuntimeMetaOverlayState = {
  connection: 'connecting' | 'live' | 'degraded' | 'offline';
  status: 'idle' | 'running' | 'completed' | 'error';
  operation: string;
  step: string;
  traceId: string;
  summary: string;
  progress: number;
  latencyHintMs: number | null;
  lastSeq: number;
  recentEvents: Array<{ label: string; at: string }>;
};

type IntentSource = 'manual' | 'suggestion' | null;

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
let entitlementSnapshot: EntitlementSnapshot = null;
let entitlementStatusKnown = false;
let bridgeAvailable = false;
let installationSnapshot = {
  state: 'idle',
  label: 'Ready to install',
  progress: 0,
  profile: null as string | null,
  action_required: null as string | null,
};
let installationPollTimer: number | null = null;
let firstRunCompleted = false;
const BENCHMARK_CACHE_KEY = 'selectpilot_runtime_benchmark_v1';
const RUNTIME_META_MAX_EVENTS = 6;
const XRAY_ENABLED = new URLSearchParams(location.search).has('xray');

let runtimeMetaEventSource: EventSource | null = null;
let runtimeMetaReconnectTimer: number | null = null;
let runtimeMetaReconnectDelayMs = 1200;
const runtimeMetaOverlayState: RuntimeMetaOverlayState = {
  connection: 'connecting',
  status: 'idle',
  operation: '—',
  step: '—',
  traceId: '—',
  summary: 'Waiting for deterministic local runtime events.',
  progress: 0,
  latencyHintMs: null,
  lastSeq: 0,
  recentEvents: [],
};
let intentSuggestions: string[] = [];
let selectedIntentSuggestion: string | null = null;

function setStatus(text: string) {
  if (resultShellEl?.getAttribute('aria-busy') === 'true') return;
  if (statusEl) statusEl.textContent = text;
}

function setSilentProcessing(active: boolean) {
  processingFieldEl?.classList.toggle('is-active', active);
  resultShellEl?.setAttribute('aria-busy', String(active));
}

function setStatusBar(text: string) {
  if (statusBar) statusBar.textContent = text;
}

function applyResponseRuntimeTruth(taskFamily: 'extract' | 'summarize' | 'agent', response: unknown) {
  const value = response as {
    model?: unknown;
    source?: unknown;
    routing?: { model?: unknown; num_ctx?: unknown; reason?: unknown };
  };
  const routing = value?.routing;
  if (
    typeof value?.model !== 'string'
    || !value.model
    || typeof value?.source !== 'string'
    || !value.source
    || typeof routing?.model !== 'string'
    || routing.model !== value.model
    || typeof routing.num_ctx !== 'number'
    || !Number.isInteger(routing.num_ctx)
    || Number(routing.num_ctx) <= 0
    || typeof routing.reason !== 'string'
    || !routing.reason
  ) {
    throw new Error('Runtime response omitted its exact local model contract');
  }

  applyRuntimeEvent({
    taskFamily,
    selectedModel: routing.model,
    executionGeography: 'local',
  });
  const profile = getEffectiveRecommendedProfile();
  const reason = routing.reason.replace(/_/g, ' ');
  if (truthExecutionEl) truthExecutionEl.textContent = 'Local';
  if (truthModelEl) truthModelEl.textContent = routing.model;
  if (truthProfileEl) truthProfileEl.textContent = `${profile.label} · ${Number(routing.num_ctx).toLocaleString()} ctx`;
  setStatusBar(`${taskFamily} · ${routing.model} · ${Number(routing.num_ctx).toLocaleString()} ctx · ${reason}`);
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

function formatEntitlementUpdatedAt(timestamp?: number): string {
  if (!timestamp) return 'no cached entitlement';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'no cached entitlement';
  return `cached ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function toClockText(iso?: string): string {
  if (!iso) return '--:--:--';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--:--:--';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function compactStep(step?: string): string {
  if (!step) return '—';
  return step.replace(/_/g, ' ').toLowerCase();
}

function compactOperation(operation?: string): string {
  if (!operation) return '—';
  return operation;
}

function compactTrace(trace?: string): string {
  if (!trace) return '—';
  if (trace.length <= 16) return trace;
  return `${trace.slice(0, 8)}…${trace.slice(-4)}`;
}

function runtimeMetaEventLabel(event: RuntimeMetaEvent): string {
  const step = event.step ? compactStep(event.step) : '';
  const base = step ? `${event.event_type} · ${step}` : event.event_type;
  if (event.duration_ms) return `${base} · ${event.duration_ms} ms`;
  return base;
}

function inferRuntimeMetaProgress(eventType: string): number {
  switch (eventType) {
    case 'RUNTIME_STARTED':
      return 8;
    case 'STEP_STARTED':
      return 35;
    case 'STEP_COMPLETED':
      return 65;
    case 'RUNTIME_COMPLETED':
      return 100;
    case 'STEP_FAILED':
    case 'RUNTIME_FAILED':
      return 100;
    default:
      return runtimeMetaOverlayState.progress;
  }
}

function pushRuntimeMetaEvent(label: string, iso: string) {
  runtimeMetaOverlayState.recentEvents = [{ label, at: toClockText(iso) }, ...runtimeMetaOverlayState.recentEvents].slice(0, RUNTIME_META_MAX_EVENTS);
}

function renderRuntimeMetaOverlay() {
  if (!runtimeMetaOverlayEl) return;

  if (runtimeMetaStatusEl) {
    runtimeMetaStatusEl.textContent = runtimeMetaOverlayState.status === 'idle'
      ? 'Idle'
      : runtimeMetaOverlayState.status === 'running'
        ? 'Running'
        : runtimeMetaOverlayState.status === 'completed'
          ? 'Completed'
          : 'Error';
  }

  if (runtimeMetaConnectionEl) {
    runtimeMetaConnectionEl.classList.remove('is-live', 'is-degraded', 'is-offline');
    if (runtimeMetaOverlayState.connection === 'live') runtimeMetaConnectionEl.classList.add('is-live');
    if (runtimeMetaOverlayState.connection === 'degraded') runtimeMetaConnectionEl.classList.add('is-degraded');
    if (runtimeMetaOverlayState.connection === 'offline') runtimeMetaConnectionEl.classList.add('is-offline');
    runtimeMetaConnectionEl.textContent = runtimeMetaOverlayState.connection;
  }

  if (runtimeMetaSummaryEl) {
    const latency = runtimeMetaOverlayState.latencyHintMs ? ` · latency hint ${runtimeMetaOverlayState.latencyHintMs} ms` : '';
    runtimeMetaSummaryEl.textContent = `${runtimeMetaOverlayState.summary}${latency}`;
  }

  if (runtimeMetaProgressBarEl) {
    const clamped = Math.max(0, Math.min(100, runtimeMetaOverlayState.progress));
    runtimeMetaProgressBarEl.style.width = `${clamped}%`;
  }

  if (runtimeMetaOperationEl) runtimeMetaOperationEl.textContent = runtimeMetaOverlayState.operation;
  if (runtimeMetaStepEl) runtimeMetaStepEl.textContent = runtimeMetaOverlayState.step;
  if (runtimeMetaTraceEl) runtimeMetaTraceEl.textContent = runtimeMetaOverlayState.traceId;

  if (runtimeMetaEventsEl) {
    runtimeMetaEventsEl.replaceChildren();
    for (const evt of runtimeMetaOverlayState.recentEvents) {
      const li = document.createElement('li');
      const left = document.createElement('span');
      left.textContent = evt.label;
      const right = document.createElement('span');
      right.textContent = evt.at;
      li.append(left, right);
      runtimeMetaEventsEl.append(li);
    }
  }
}

function deriveIntentSuggestions(text: string): string[] {
  const value = (text || '').trim();
  const normalized = value.toLowerCase();
  const suggestions = [
    'Extract structured JSON',
    'Rewrite clearly and concisely',
    'Summarize for quick decision',
    'Extract concrete action items',
    'Answer from this context',
  ];

  if (normalized.includes('?')) {
    suggestions.unshift('Answer the main question precisely');
  }
  if (/\d/.test(normalized)) {
    suggestions.unshift('Extract key numbers and facts');
  }
  if (value.length > 1200) {
    suggestions.unshift('Compress into executive brief');
  }

  return Array.from(new Set(suggestions)).slice(0, 5);
}

function getIntentSource(): IntentSource {
  const current = intentInputEl?.value.trim() || '';
  if (!current) return null;
  return selectedIntentSuggestion && current === selectedIntentSuggestion ? 'suggestion' : 'manual';
}

function renderIntentSuggestions() {
  clearNode(intentSuggestionsEl);
  if (!intentSuggestionsEl) return;

  for (const suggestion of intentSuggestions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = suggestion;
    if (selectedIntentSuggestion === suggestion) button.classList.add('is-selected');
    button.disabled = isBusy || !runtimeSnapshot.ok;
    button.addEventListener('click', () => {
      selectedIntentSuggestion = suggestion;
      if (intentInputEl) intentInputEl.value = suggestion;
      renderIntentSuggestions();
      syncControlAvailability();
    });
    intentSuggestionsEl.append(button);
  }
}

function refreshIntentSuggestions() {
  const sourceText = selectionPreview.selection || selectionPreview.pageText || '';
  intentSuggestions = deriveIntentSuggestions(sourceText);
  const current = intentInputEl?.value.trim() || '';
  if (!current || !intentSuggestions.includes(current)) {
    selectedIntentSuggestion = null;
  }
  renderIntentSuggestions();
}

function renderIntentClarification(compiled: IntentCompileResponse) {
  const question = compiled.question || 'Clarification is required before execution.';
  const options = Array.isArray(compiled.options) ? compiled.options : [];
  const markdown = options.length
    ? `${question}\n\n${options.map((option) => `- ${option}`).join('\n')}`
    : question;

  renderOutput({
    title: 'Clarification required',
    eyebrow: 'Intent compiler',
    markdown,
    json: {
      clarify_required: true,
      ambiguity_score: compiled.ambiguity_score,
      question,
      options,
      ir: compiled.ir,
    },
    meta: 'Deterministic intent compiler refused to guess. Clarify intent and run again.',
    exportBase: 'selectpilot-intent-clarification',
  });
  renderExports({ markdown, json: { clarify_required: true, question, options, ir: compiled.ir }, basename: 'selectpilot-intent-clarification' });
}

async function doExecuteIntent() {
  const intentText = intentInputEl?.value.trim() || '';
  if (!intentText) throw new Error('Intent is required before execution');
  setIntent(intentText);

  const source = getIntentSource() || 'manual';
  setStatus(`Compiling intent (${source})...`);

  const compiled = await request('panel:intent_compile', { intent: intentText }) as IntentCompileResponse;
  if (compiled.clarify_required) {
    renderIntentClarification(compiled);
    setStatus('Clarification required before execution');
    return;
  }

  const operation = compiled.operation;
  if (operation === 'extract') {
    const preset: ExtractionPresetKey | undefined = intentText.toLowerCase().includes('action') ? 'action_brief' : undefined;
    setStatus(`Executing compiled intent (${source}) → extract...`);
    await doExtract(preset);
    return;
  }

  if (operation === 'summarize') {
    setStatus(`Executing compiled intent (${source}) → summarize...`);
    await doSummarize();
    return;
  }

  if (operation === 'agent' || !operation) {
    if (agentPromptEl) {
      agentPromptEl.value = intentText;
    }
    setStatus(`Executing compiled intent (${source}) → agent...`);
    await doAsk();
    return;
  }

  throw new Error('Intent compiler returned an unsupported operation');
}

function clearIntentInput() {
  if (intentInputEl) intentInputEl.value = '';
  selectedIntentSuggestion = null;
  renderIntentSuggestions();
  syncControlAvailability();
}

function applyRuntimeMetaEvent(event: RuntimeMetaEvent) {
  if (typeof event.seq === 'number') {
    runtimeMetaOverlayState.lastSeq = Math.max(runtimeMetaOverlayState.lastSeq, event.seq);
  }

  runtimeMetaOverlayState.operation = compactOperation(event.operation);
  runtimeMetaOverlayState.step = compactStep(event.step);
  runtimeMetaOverlayState.traceId = compactTrace(event.trace_id);
  runtimeMetaOverlayState.latencyHintMs = typeof event.latency_hint_ms === 'number' ? event.latency_hint_ms : runtimeMetaOverlayState.latencyHintMs;

  if (event.event_type === 'RUNTIME_STARTED' || event.event_type === 'STEP_STARTED') {
    runtimeMetaOverlayState.status = 'running';
  } else if (event.event_type === 'RUNTIME_COMPLETED') {
    runtimeMetaOverlayState.status = 'completed';
  } else if (event.event_type === 'RUNTIME_FAILED' || event.event_type === 'STEP_FAILED') {
    runtimeMetaOverlayState.status = 'error';
  }

  runtimeMetaOverlayState.progress = inferRuntimeMetaProgress(event.event_type);
  runtimeMetaOverlayState.summary = event.message || runtimeMetaEventLabel(event);

  const stepState =
    event.event_type === 'RUNTIME_COMPLETED' || event.event_type === 'STEP_COMPLETED'
      ? 'done'
      : event.event_type === 'RUNTIME_FAILED' || event.event_type === 'STEP_FAILED'
        ? 'error'
        : event.event_type === 'RUNTIME_STARTED' || event.event_type === 'STEP_STARTED'
          ? 'running'
          : 'waiting';

  applyRuntimeEvent({
    step: {
      id: String(event.step || event.event_type || 'runtime_event'),
      label: runtimeMetaEventLabel(event),
      state: stepState,
    },
  });

  pushRuntimeMetaEvent(runtimeMetaEventLabel(event), event.timestamp);
  renderRuntimeMetaOverlay();
}

function clearRuntimeMetaReconnect() {
  if (runtimeMetaReconnectTimer !== null) {
    window.clearTimeout(runtimeMetaReconnectTimer);
    runtimeMetaReconnectTimer = null;
  }
}

function scheduleRuntimeMetaReconnect() {
  clearRuntimeMetaReconnect();
  runtimeMetaReconnectTimer = window.setTimeout(() => {
    void connectRuntimeMetaStream();
  }, runtimeMetaReconnectDelayMs);
  runtimeMetaReconnectDelayMs = Math.min(10000, Math.round(runtimeMetaReconnectDelayMs * 1.35));
}

function disconnectRuntimeMetaStream() {
  clearRuntimeMetaReconnect();
  if (runtimeMetaEventSource) {
    runtimeMetaEventSource.close();
    runtimeMetaEventSource = null;
  }
}

async function connectRuntimeMetaStream() {
  disconnectRuntimeMetaStream();

  try {
    await getRuntimeMetaHealth();
  } catch {
    runtimeMetaOverlayState.connection = 'offline';
    runtimeMetaOverlayState.summary = 'Runtime meta stream unavailable.';
    renderRuntimeMetaOverlay();
    scheduleRuntimeMetaReconnect();
    return;
  }

  runtimeMetaOverlayState.connection = 'connecting';
  renderRuntimeMetaOverlay();

  const source = new EventSource(getRuntimeMetaStreamUrl(runtimeMetaOverlayState.lastSeq));
  runtimeMetaEventSource = source;

  source.addEventListener('open', () => {
    runtimeMetaOverlayState.connection = 'live';
    runtimeMetaOverlayState.summary = runtimeMetaOverlayState.status === 'running'
      ? runtimeMetaOverlayState.summary
      : 'Runtime meta stream connected.';
    runtimeMetaReconnectDelayMs = 1200;
    renderRuntimeMetaOverlay();
  });

  source.addEventListener('runtime_meta', (evt: Event) => {
    const event = evt as MessageEvent;
    try {
      const payload = JSON.parse(String(event.data || '{}')) as RuntimeMetaEvent;
      applyRuntimeMetaEvent(payload);
    } catch {
      runtimeMetaOverlayState.connection = 'degraded';
      runtimeMetaOverlayState.summary = 'Received invalid runtime meta event payload.';
      renderRuntimeMetaOverlay();
    }
  });

  source.addEventListener('heartbeat', () => {
    if (runtimeMetaOverlayState.connection !== 'live') {
      runtimeMetaOverlayState.connection = 'live';
      renderRuntimeMetaOverlay();
    }
  });

  source.addEventListener('error', () => {
    runtimeMetaOverlayState.connection = 'degraded';
    runtimeMetaOverlayState.summary = 'Runtime meta stream disconnected, reconnecting…';
    renderRuntimeMetaOverlay();
    disconnectRuntimeMetaStream();
    scheduleRuntimeMetaReconnect();
  });
}

function getEntitlementCacheState(snapshot: EntitlementSnapshot): 'fresh' | 'cached' | 'stale' | 'expired' {
  if (!snapshot?.token) return 'cached';
  const now = Date.now();
  if (snapshot.expiresAt && now > snapshot.expiresAt) return 'expired';
  const age = now - (snapshot.cachedAt || 0);
  if (!snapshot.cachedAt) return 'cached';
  if (age <= ENTITLEMENT_FRESH_MS) return 'fresh';
  if (age <= 24 * 60 * 60 * 1000) return 'cached';
  return 'stale';
}

function getEffectiveRecommendedProfileKey(): string {
  return benchmarkSnapshot?.recommended_profile || runtimeProfilesPayload.recommended_profile;
}

function getEffectiveRecommendedProfile() {
  return getRuntimeProfile(getEffectiveRecommendedProfileKey());
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
  const hasStructured = lastResult?.structured ? Object.keys(lastResult.structured).length > 0 : false;
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

    const downloadPlainText = document.createElement('button');
    downloadPlainText.textContent = 'Download .txt';
    downloadPlainText.addEventListener('click', () => {
      triggerDownload(markdown, `${basename}.txt`, 'text/plain;charset=utf-8');
      setStatus('Plain text downloaded');
    });
    actions.append(downloadPlainText);
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
  if (res?.error) {
    const err = new Error(String(res.error));
    (err as any).code = res.errorCode;
    (err as any).details = res.errorDetails;
    (err as any).traceId = res.traceId;
    (err as any).status = res.status;
    throw err;
  }
  return res;
}

function formatPanelError(errorLike: any): string {
  const message = String(errorLike?.message || 'Request failed');
  const code = errorLike?.code ? String(errorLike.code) : '';
  const traceId = errorLike?.traceId ? String(errorLike.traceId) : '';
  if (code && traceId) return `${message} [${code}] · trace ${traceId}`;
  if (code) return `${message} [${code}]`;
  if (traceId) return `${message} · trace ${traceId}`;
  return message;
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

function renderEntitlementStatus() {
  if (!entitlementStatusEl) return;
  if (!entitlementStatusKnown) {
    entitlementStatusEl.textContent = 'Access state unavailable · refresh required.';
    return;
  }
  const tier = entitlementSnapshot?.tier || 'essential';
  const token = entitlementSnapshot?.token;
  if (!token) {
    entitlementStatusEl.textContent = 'No active access yet.';
    return;
  }
  const suffix = formatEntitlementUpdatedAt(entitlementSnapshot?.cachedAt);
  const cacheState = getEntitlementCacheState(entitlementSnapshot);
  entitlementStatusEl.textContent = `${tier} access · ${cacheState} · ${suffix}`;
}

async function refreshEntitlementStatus() {
  try {
    entitlementSnapshot = await request('entitlement:get');
    entitlementStatusKnown = true;
  } catch {
    entitlementSnapshot = null;
    entitlementStatusKnown = false;
  }
  renderEntitlementStatus();
  renderSelectionState();
  syncControlAvailability();
}

async function attachLicenseToken(token = licenseTokenInputEl?.value.trim() || '') {
  if (!token) throw new Error('Enter your license key');
  setStatus('Activating access...');
  await request('license:attach_token', { token });
  await request('entitlement:refresh');
  await refreshEntitlementStatus();
  if (licenseTokenInputEl) licenseTokenInputEl.value = '';
  setStatus('Access ready');
}

async function getInstallationId(): Promise<string> {
  const key = 'selectpilot_installation_id';
  const stored = await chrome.storage.local.get(key);
  if (typeof stored[key] === 'string' && stored[key]) return stored[key];
  const value = crypto.randomUUID();
  await chrome.storage.local.set({ [key]: value });
  return value;
}

async function startTrial() {
  setStatus('Preparing your trial...');
  const response = await fetch(endpoints.licenseTrial, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ installation_id: await getInstallationId() }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Trial could not be started');
  const result = await response.json() as { token?: string };
  if (!result.token) throw new Error('Trial response was incomplete');
  await attachLicenseToken(result.token);
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
  if (intentInputEl) intentInputEl.disabled = isBusy || !runtimeReady || !selectionReady;
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
  if (attachLicenseButtonEl) attachLicenseButtonEl.disabled = isBusy || !licenseTokenInputEl?.value.trim();
  if (startTrialButtonEl) startTrialButtonEl.disabled = isBusy || Boolean(entitlementSnapshot?.token);
  if (intentExecuteButtonEl) {
    const hasIntent = Boolean(intentInputEl?.value.trim());
    intentExecuteButtonEl.disabled = isBusy || !runtimeReady || !selectionReady || !hasIntent;
  }
  if (intentClearButtonEl) intentClearButtonEl.disabled = isBusy;
  const firstRunButton = document.querySelector<HTMLButtonElement>('#btn-first-run-example');
  if (firstRunButton) firstRunButton.disabled = isBusy || !runtimeReady || !entitlementSnapshot?.token;
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

function renderRuntimeState() {
  clearNode(runtimeStateEl);
  if (!runtimeStateEl) return;

  runtimeStateEl.classList.add('is-visible');
  if (runtimeSnapshot.ok) {
    runtimeStateEl.classList.remove('is-visible');
    return;
  }

  if (!bridgeAvailable) {
    const helper = createCard(
      'Installation',
      'One small helper is needed',
      'It keeps selected text on this computer and prepares the right local model.'
    );
    const link = document.createElement('a');
    link.className = 'primary-action';
    link.href = 'https://selectpilot.app/downloads/SelectPilot-Installer.pkg';
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = 'Install local helper';
    runtimeStateEl.append(helper, link);
    return;
  }

  const installation = createCard(
    'Installation',
    installationSnapshot.label,
    'The right local setup will be chosen automatically for this Mac.'
  );
  const progress = document.createElement('div');
  progress.className = 'installation-progress';
  progress.setAttribute('role', 'progressbar');
  progress.setAttribute('aria-valuemin', '0');
  progress.setAttribute('aria-valuemax', '100');
  progress.setAttribute('aria-valuenow', String(installationSnapshot.progress));
  const fill = document.createElement('span');
  fill.style.width = `${installationSnapshot.progress}%`;
  progress.append(fill);
  installation.append(progress);

  if (installationSnapshot.state === 'installing') {
    runtimeStateEl.append(installation);
    scheduleInstallationPoll();
    return;
  }

  const action = document.createElement('button');
  action.className = 'primary-action';
  action.type = 'button';
  action.textContent = installationSnapshot.state === 'action_required' ? 'Try again' : 'Install Ollama and continue';
  action.addEventListener('click', () => void startLocalInstallation());
  runtimeStateEl.append(installation, action);
  return;

}

async function refreshInstallationStatus() {
  const response = await fetch(endpoints.installationStatus, { cache: 'no-store' });
  if (!response.ok) throw new Error('installation_status_unavailable');
  installationSnapshot = await response.json();
}

async function startLocalInstallation() {
  const response = await fetch(endpoints.installationStart, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ consent: true }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Installation could not start');
  installationSnapshot = await response.json();
  renderRuntimeState();
}

function scheduleInstallationPoll() {
  if (installationPollTimer !== null) return;
  installationPollTimer = window.setTimeout(async () => {
    installationPollTimer = null;
    try {
      await refreshInstallationStatus();
      if (installationSnapshot.state === 'ready') await refreshRuntime();
      else renderRuntimeState();
    } catch {
      renderRuntimeState();
    }
  }, 900);
}

function renderSelectionState() {
  clearNode(selectionCardEl);
  if (!selectionCardEl) return;

  const showFirstRunExample = runtimeSnapshot.ok
    && Boolean(entitlementSnapshot?.token)
    && !selectionPreview.hasSelection
    && !firstRunCompleted;

  const header = document.createElement('div');
  header.className = 'output-eyebrow';
  header.textContent = showFirstRunExample
    ? 'First result'
    : (selectionPreview.hasSelection ? 'Active selection' : 'No active selection');

  const title = document.createElement('h3');
  title.textContent = showFirstRunExample ? 'See SelectPilot once' : (selectionPreview.title || 'Current page');

  const copy = document.createElement('p');
  copy.className = 'selection-copy';
  if (showFirstRunExample) {
    copy.textContent = FIRST_RUN_EXAMPLE.text;
  } else if (selectionPreview.hasSelection) {
    copy.textContent = shorten(selectionPreview.selection, 260);
  } else {
    copy.textContent = 'Highlight text on the current page to activate the primary action.';
  }

  const meta = document.createElement('p');
  meta.className = 'selection-copy';
  const charCount = selectionPreview.selection.length;
  meta.textContent = showFirstRunExample
    ? 'Local example · Action Brief · no page content used'
    : `Selection · ${charCount} chars${selectionPreview.url ? ` · ${selectionPreview.url}` : ''}`;

  selectionCardEl.append(header, title, copy, meta);
  if (showFirstRunExample) {
    const action = document.createElement('button');
    action.id = 'btn-first-run-example';
    action.className = 'selection-example-action';
    action.type = 'button';
    action.textContent = 'Try local example';
    action.disabled = isBusy;
    selectionCardEl.append(action);
  }
}

async function refreshSelectionPreview() {
  const preview = await request('panel:get_selection_preview');
  selectionPreview = {
    selection: preview.selection || '',
    pageText: preview.pageText || '',
    title: preview.title || '',
    url: preview.url || '',
    hasSelection: Boolean(preview.hasSelection),
    pageColor: typeof preview.pageColor === 'string' ? preview.pageColor : '',
  };
  if (/^(?:rgb|hsl)a?\([^)]*\)$|^#[0-9a-f]{6}$/i.test(selectionPreview.pageColor || '')) {
    document.documentElement.style.setProperty('--context-tint', selectionPreview.pageColor || 'transparent');
  }
  setSelectionContext({
    selectionOrigin: selectionPreview.hasSelection ? 'selection' : 'page_context',
    contentLength: selectionPreview.hasSelection ? selectionPreview.selection.length : selectionPreview.pageText.length,
  });
  renderSelectionState();
  refreshIntentSuggestions();
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
    runtimeProfilesPayload = await fetchRuntimeProfiles();
    const health = await fetchHealth();
    bridgeAvailable = true;
    try {
      await refreshInstallationStatus();
    } catch {
      installationSnapshot = {
        state: 'error',
        label: 'Installation state unavailable',
        progress: 0,
        profile: null,
        action_required: 'Refresh the local bridge before changing runtime state.',
      };
    }
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
    setSelectionContext({
      executionBoundary: runtimeSnapshot.privacyMode,
      privacyMode: runtimeSnapshot.privacyMode,
    });
    if (truthExecutionEl) truthExecutionEl.textContent = runtimeSnapshot.ok ? 'Local' : 'Degraded';
    if (truthModelEl) truthModelEl.textContent = runtimeSnapshot.activeModel;
    if (truthBoundaryEl) truthBoundaryEl.textContent = runtimeSnapshot.privacyMode === 'local-only' ? 'Selected text stays local' : runtimeSnapshot.privacyMode;
    if (truthPrivacyEl) {
      const localOnly = !!privacyProofSnapshot?.ok && !privacyProofSnapshot?.outbound_observation?.external_calls_registered;
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
    bridgeAvailable = false;
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
  renderSelectionState();
  syncControlAvailability();
}

async function doSummarize() {
  setStatus('Summarizing selected text...');
  const res = await request('panel:summarize');
  applyResponseRuntimeTruth('summarize', res);
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
  applyResponseRuntimeTruth('extract', res);
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

async function doFirstRunExample() {
  const selectedPreset = getExtractionPreset(FIRST_RUN_EXAMPLE.preset);
  const res = await request('panel:extract_demo');
  applyResponseRuntimeTruth('extract', res);
  renderOutput({
    title: res.label || selectedPreset.label,
    markdown: res.markdown || '',
    json: res.json || {},
    eyebrow: 'Your first structured result',
    meta: 'Created locally from the example above. Ready to read or export.',
    exportBase: 'selectpilot-first-result',
  });
  renderExports({ markdown: res.markdown, json: res.json, basename: 'selectpilot-first-result' });
  await setJSON(FIRST_RUN_COMPLETED_KEY, true);
  firstRunCompleted = true;
  renderSelectionState();
  setStatus('Ready to export');
}

async function doRewrite() {
  const prompt = agentPromptEl?.value.trim() || 'Rewrite the selected text in clearer, tighter language.';
  setStatus('Rewriting...');
  const res = await request('panel:agent', { prompt });
  applyResponseRuntimeTruth('agent', res);
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
  applyResponseRuntimeTruth('agent', res);
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
  loadFrontierReport([]);
  loadDeterminismReport({
    selection_consistency_rate: 1,
    output_shape_consistency_rate: 1,
    frontier_decision_consistency_rate: 1,
    score: 1,
  });
  loadBottleneckReport({
    inference_dominance_ratio: 1,
    validation_overhead_ratio: 0,
    orchestration_overhead_ratio: 0,
    dominant_cost_center: 'inference',
  });
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
  const wrap = (fn: () => Promise<void>, mode: 'silent' | 'explicit' = 'explicit') => async () => {
    isBusy = true;
    if (mode === 'silent') setSilentProcessing(true);
    syncControlAvailability();
    try {
      await fn();
    } catch (e: any) {
      setSilentProcessing(false);
      const text = formatPanelError(e);
      setStatus(text);
      setStatusBar(text);
    } finally {
      isBusy = false;
      setSilentProcessing(false);
      syncControlAvailability();
      void Promise.all([refreshSelectionPreview(), refreshMemoryStatus(), refreshEntitlementStatus()]);
    }
  };

  refreshButtonEl?.addEventListener('click', () => {
    void Promise.all([refreshRuntime(), refreshSelectionPreview(), refreshMemoryStatus(), refreshEntitlementStatus()]);
  });
  $('#btn-extract')?.addEventListener('click', wrap(() => doExtract(), 'silent'));
  selectionCardEl?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.id === 'btn-first-run-example') void wrap(() => doFirstRunExample(), 'silent')();
  });
  $('#btn-summarize')?.addEventListener('click', wrap(() => doSummarize(), 'silent'));
  $('#btn-rewrite')?.addEventListener('click', wrap(() => doRewrite(), 'silent'));
  $('#btn-actions')?.addEventListener('click', wrap(() => doActions(), 'silent'));
  $('#btn-ask')?.addEventListener('click', wrap(() => doAsk(), 'silent'));
  memoryToggleButtonEl?.addEventListener('click', wrap(() => doMemoryToggle()));
  memoryInspectButtonEl?.addEventListener('click', wrap(() => doMemoryInspect()));
  memoryExportButtonEl?.addEventListener('click', wrap(() => doMemoryExport()));
  memoryDeleteButtonEl?.addEventListener('click', wrap(() => doMemoryDelete()));
  intentExecuteButtonEl?.addEventListener('click', wrap(() => doExecuteIntent(), 'silent'));
  intentClearButtonEl?.addEventListener('click', () => clearIntentInput());
  intentInputEl?.addEventListener('input', () => {
    selectedIntentSuggestion = null;
    syncControlAvailability();
  });
  intentInputEl?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void wrap(() => doExecuteIntent(), 'silent')();
  });
  attachLicenseButtonEl?.addEventListener('click', wrap(() => attachLicenseToken()));
  startTrialButtonEl?.addEventListener('click', wrap(() => startTrial()));
  viewPlansButtonEl?.addEventListener('click', wrap(async () => {
    await chrome.tabs.create({ url: 'https://selectpilot.app/pricing', active: true });
  }));
  licenseTokenInputEl?.addEventListener('input', () => syncControlAvailability());
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
    void Promise.all([refreshRuntime(), refreshSelectionPreview(), refreshMemoryStatus(), refreshEntitlementStatus()]);
  });
}

populatePresetOptions();
bindActions();

async function initialize() {
  const storedSettings = await chrome.storage.local.get('selectpilot_settings');
  const settings = (storedSettings.selectpilot_settings || {}) as Record<string, unknown>;
  const textSize = typeof settings.textSize === 'string' ? settings.textSize : 'standard';
  document.body.dataset.controlSide = settings.controlSide === 'left' ? 'left' : 'right';
  document.body.dataset.textSize = ['large', 'larger'].includes(textSize) ? textSize : 'standard';
  document.body.dataset.highContrast = settings.highContrast ? 'true' : 'false';
  document.body.dataset.reduceMotion = settings.reduceMotion ? 'true' : 'false';
  currentResultView = settings.resultView === 'structured' ? 'structured' : 'readable';
  const topologyValidation = validateTopologyMap();
  const requiredTopologyComponents = [
    'panel_header',
    'runtime_meta_overlay',
    'truth_strip',
    'runtime_state',
    'selection_shell',
    'intent_shell',
    'workspace',
    'result_shell',
    'memory_shell',
    'status_footer',
  ];
  const topologyBindingErrors: string[] = [];
  for (const componentId of requiredTopologyComponents) {
    if (!getTopologyForComponent(componentId)) {
      topologyBindingErrors.push(`missing_topology:${componentId}`);
    }
  }
  if (!topologyValidation.ok || topologyBindingErrors.length) {
    setStatus(`Topology contract failed: ${[...topologyValidation.errors, ...topologyBindingErrors].join(', ')}`);
  }

  setVisiblePanels(['selection_surface', 'runtime_surface', 'report_surface']);
  firstRunCompleted = Boolean(await getJSON<boolean>(FIRST_RUN_COMPLETED_KEY));
  if (XRAY_ENABLED) {
    renderRuntimeMetaOverlay();
    void connectRuntimeMetaStream();
  }
  refreshIntentSuggestions();
  await loadBenchmarkSnapshot();
  renderMemoryState();
  refreshTier();
  renderRuntimeState();
  renderSelectionState();
  renderEntitlementStatus();
  updateResultChrome();
  renderResultBody();
  renderExports({});
  await Promise.all([refreshRuntime(), refreshSelectionPreview(), refreshMemoryStatus(), refreshEntitlementStatus()]);
}

void initialize();

window.addEventListener('beforeunload', () => {
  disconnectRuntimeMetaStream();
});
