import { $ } from '../utils/dom.js';
import { getJSON, setJSON } from '../utils/storage.js';
import { endpoints } from '../api/endpoints.js';
import { getRuntimeMetaHealth, getRuntimeMetaStreamUrl } from '../api/nano-client.js';
import { EXTRACTION_PRESETS, getExtractionPreset } from './extraction-presets.js';
import { getRuntimeProfile, RUNTIME_PROFILES } from './runtime-profiles.js';
import { buildKnowledgePackage } from './knowledge-connectors.js';
import { applyRuntimeEvent, setIntent, setSelectionContext, setVisiblePanels } from './state/runtimeStore.js';
import { loadBottleneckReport, loadDeterminismReport, loadFrontierReport } from './state/reportStore.js';
import { getTopologyForComponent, validateTopologyMap } from './layout/topologyMap.js';
const workflow = $('#workflow');
const exportsEl = $('#exports');
const runtimeStateEl = $('#runtime-state');
const memoryShellEl = $('#memory-shell');
const memoryStatusEl = $('#memory-status');
const memoryMetaEl = $('#memory-meta');
const memoryTargetEl = $('#memory-target');
const orderIdInputEl = $('#order-id');
const syncOrderButtonEl = $('#btn-sync-order');
const entitlementStatusEl = $('#entitlement-status');
const memoryToggleButtonEl = $('#btn-memory-toggle');
const memoryInspectButtonEl = $('#btn-memory-inspect');
const memoryExportButtonEl = $('#btn-memory-export');
const memoryDeleteButtonEl = $('#btn-memory-delete');
const selectionCardEl = $('#selection-card');
const statusEl = $('#status');
const tierEl = $('#tier');
const statusBar = $('#status-bar');
const refreshButtonEl = $('#btn-refresh');
const agentPromptEl = $('#agent-prompt');
const extractPresetEl = $('#extract-preset');
const extractHelpEl = $('#extract-help');
const resultTitleEl = $('#result-title');
const resultMetaEl = $('#result-meta');
const tabReadableEl = $('#tab-readable');
const tabStructuredEl = $('#tab-structured');
const truthExecutionEl = $('#truth-execution');
const truthModelEl = $('#truth-model');
const truthBoundaryEl = $('#truth-boundary');
const truthPrivacyEl = $('#truth-privacy');
const truthPrivacyMetaEl = $('#truth-privacy-meta');
const leakageStatusEl = $('#leakage-status');
const leakageDetailsEl = $('#leakage-details');
const truthProfileEl = $('#truth-profile');
const truthLatencyEl = $('#truth-latency');
const intentInputEl = $('#intent-input');
const intentSuggestionsEl = $('#intent-suggestions');
const intentExecuteButtonEl = $('#btn-intent-execute');
const intentClearButtonEl = $('#btn-intent-clear');
const runtimeMetaOverlayEl = $('#runtime-meta-overlay');
const runtimeMetaStatusEl = $('#runtime-meta-status');
const runtimeMetaConnectionEl = $('#runtime-meta-connection');
const runtimeMetaSummaryEl = $('#runtime-meta-summary');
const runtimeMetaProgressBarEl = $('#runtime-meta-progress-bar');
const runtimeMetaOperationEl = $('#runtime-meta-operation');
const runtimeMetaStepEl = $('#runtime-meta-step');
const runtimeMetaTraceEl = $('#runtime-meta-trace');
const runtimeMetaEventsEl = $('#runtime-meta-events');
const actionButtons = Array.from(document.querySelectorAll('.primary-action, .secondary-grid button, .advanced-grid button'));
const ENTITLEMENT_FRESH_MS = 15 * 60 * 1000;
let isBusy = false;
let runtimeSnapshot = {
    ok: false,
    reachable: false,
    activeModel: 'Unavailable',
    ignoredRemoteCount: 0,
    privacyMode: 'local-only',
    latencyMs: null,
    status: 'checking',
};
let selectionPreview = {
    selection: '',
    pageText: '',
    title: '',
    url: '',
    hasSelection: false,
};
let currentResultView = 'readable';
let lastResult = null;
let runtimeProfilesPayload = {
    profiles: RUNTIME_PROFILES,
    recommended_profile: 'fast',
    reason: 'The smallest viable profile is the safest starting point.',
};
let benchmarkSnapshot = null;
let privacyProofSnapshot = null;
let memorySnapshot = {
    tier: 'essential',
    supported: false,
    enabled: false,
    entries: 0,
    lastUpdatedAt: null,
};
let entitlementSnapshot = null;
const BENCHMARK_CACHE_KEY = 'selectpilot_runtime_benchmark_v1';
const RUNTIME_META_MAX_EVENTS = 6;
let runtimeMetaEventSource = null;
let runtimeMetaReconnectTimer = null;
let runtimeMetaReconnectDelayMs = 1200;
const runtimeMetaOverlayState = {
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
let intentSuggestions = [];
let selectedIntentSuggestion = null;
const FAST_INSTALL_COMMANDS = [
    'ollama pull qwen2.5:0.5b',
    'ollama pull nomic-embed-text-v2-moe:latest',
    'CHROMEAI_OLLAMA_MODEL=qwen2.5:0.5b ./scripts/install-macos-local.sh',
].join('\n');
const QUICK_SETUP_COMMANDS = [
    'pnpm setup:local',
    'curl http://127.0.0.1:8083/health',
].join('\n');
function setStatus(text) {
    if (statusEl)
        statusEl.textContent = text;
}
function setStatusBar(text) {
    if (statusBar)
        statusBar.textContent = text;
}
function setLeakageFeedback(status, details) {
    if (leakageStatusEl)
        leakageStatusEl.textContent = status;
    if (leakageDetailsEl)
        leakageDetailsEl.textContent = details;
}
function clearNode(node) {
    if (node)
        node.replaceChildren();
}
function createCard(eyebrow, title, body) {
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
function shorten(text, max = 220) {
    const trimmed = text.trim();
    if (trimmed.length <= max)
        return trimmed;
    return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}
function getEfficiencyScore(snapshot) {
    if (!snapshot)
        return null;
    const avgLatency = (snapshot.extract_latency_ms + snapshot.summarize_latency_ms) / 2;
    const score = Math.round(100 - avgLatency / 40);
    return Math.max(0, Math.min(100, score));
}
function formatPrivacyVerifiedAt(iso) {
    if (!iso)
        return 'Awaiting proof';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime()))
        return 'Awaiting proof';
    return `Verified ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}
function formatMemoryUpdatedAt(timestamp) {
    if (!timestamp)
        return 'No retained events yet.';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime()))
        return 'No retained events yet.';
    return `Last updated ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}
function formatEntitlementUpdatedAt(timestamp) {
    if (!timestamp)
        return 'no cached entitlement';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime()))
        return 'no cached entitlement';
    return `cached ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}
function toClockText(iso) {
    if (!iso)
        return '--:--:--';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime()))
        return '--:--:--';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function compactStep(step) {
    if (!step)
        return '—';
    return step.replace(/_/g, ' ').toLowerCase();
}
function compactOperation(operation) {
    if (!operation)
        return '—';
    return operation;
}
function compactTrace(trace) {
    if (!trace)
        return '—';
    if (trace.length <= 16)
        return trace;
    return `${trace.slice(0, 8)}…${trace.slice(-4)}`;
}
function runtimeMetaEventLabel(event) {
    const step = event.step ? compactStep(event.step) : '';
    const base = step ? `${event.event_type} · ${step}` : event.event_type;
    if (event.duration_ms)
        return `${base} · ${event.duration_ms} ms`;
    return base;
}
function inferRuntimeMetaProgress(eventType) {
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
function pushRuntimeMetaEvent(label, iso) {
    runtimeMetaOverlayState.recentEvents = [{ label, at: toClockText(iso) }, ...runtimeMetaOverlayState.recentEvents].slice(0, RUNTIME_META_MAX_EVENTS);
}
function renderRuntimeMetaOverlay() {
    if (!runtimeMetaOverlayEl)
        return;
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
        if (runtimeMetaOverlayState.connection === 'live')
            runtimeMetaConnectionEl.classList.add('is-live');
        if (runtimeMetaOverlayState.connection === 'degraded')
            runtimeMetaConnectionEl.classList.add('is-degraded');
        if (runtimeMetaOverlayState.connection === 'offline')
            runtimeMetaConnectionEl.classList.add('is-offline');
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
    if (runtimeMetaOperationEl)
        runtimeMetaOperationEl.textContent = runtimeMetaOverlayState.operation;
    if (runtimeMetaStepEl)
        runtimeMetaStepEl.textContent = runtimeMetaOverlayState.step;
    if (runtimeMetaTraceEl)
        runtimeMetaTraceEl.textContent = runtimeMetaOverlayState.traceId;
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
function deriveIntentSuggestions(text) {
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
function getIntentSource() {
    const current = intentInputEl?.value.trim() || '';
    if (!current)
        return null;
    return selectedIntentSuggestion && current === selectedIntentSuggestion ? 'suggestion' : 'manual';
}
function renderIntentSuggestions() {
    clearNode(intentSuggestionsEl);
    if (!intentSuggestionsEl)
        return;
    for (const suggestion of intentSuggestions) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = suggestion;
        if (selectedIntentSuggestion === suggestion)
            button.classList.add('is-selected');
        button.disabled = isBusy || !runtimeSnapshot.ok;
        button.addEventListener('click', () => {
            selectedIntentSuggestion = suggestion;
            if (intentInputEl)
                intentInputEl.value = suggestion;
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
function renderIntentClarification(compiled) {
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
    if (!intentText)
        throw new Error('Intent is required before execution');
    setIntent(intentText);
    const source = getIntentSource() || 'manual';
    setStatus(`Compiling intent (${source})...`);
    const compiled = await request('panel:intent_compile', { intent: intentText });
    if (compiled.clarify_required) {
        renderIntentClarification(compiled);
        setStatus('Clarification required before execution');
        return;
    }
    const operation = compiled.operation;
    if (operation === 'extract') {
        const preset = intentText.toLowerCase().includes('action') ? 'action_brief' : undefined;
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
    if (intentInputEl)
        intentInputEl.value = '';
    selectedIntentSuggestion = null;
    renderIntentSuggestions();
    syncControlAvailability();
}
function applyRuntimeMetaEvent(event) {
    if (typeof event.seq === 'number') {
        runtimeMetaOverlayState.lastSeq = Math.max(runtimeMetaOverlayState.lastSeq, event.seq);
    }
    runtimeMetaOverlayState.operation = compactOperation(event.operation);
    runtimeMetaOverlayState.step = compactStep(event.step);
    runtimeMetaOverlayState.traceId = compactTrace(event.trace_id);
    runtimeMetaOverlayState.latencyHintMs = typeof event.latency_hint_ms === 'number' ? event.latency_hint_ms : runtimeMetaOverlayState.latencyHintMs;
    if (event.event_type === 'RUNTIME_STARTED' || event.event_type === 'STEP_STARTED') {
        runtimeMetaOverlayState.status = 'running';
    }
    else if (event.event_type === 'RUNTIME_COMPLETED') {
        runtimeMetaOverlayState.status = 'completed';
    }
    else if (event.event_type === 'RUNTIME_FAILED' || event.event_type === 'STEP_FAILED') {
        runtimeMetaOverlayState.status = 'error';
    }
    runtimeMetaOverlayState.progress = inferRuntimeMetaProgress(event.event_type);
    runtimeMetaOverlayState.summary = event.message || runtimeMetaEventLabel(event);
    const stepState = event.event_type === 'RUNTIME_COMPLETED' || event.event_type === 'STEP_COMPLETED'
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
    }
    catch {
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
    source.addEventListener('runtime_meta', (evt) => {
        const event = evt;
        try {
            const payload = JSON.parse(String(event.data || '{}'));
            applyRuntimeMetaEvent(payload);
        }
        catch {
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
function getEntitlementCacheState(snapshot) {
    if (!snapshot?.token)
        return 'cached';
    const now = Date.now();
    if (snapshot.expiresAt && now > snapshot.expiresAt)
        return 'expired';
    const age = now - (snapshot.cachedAt || 0);
    if (!snapshot.cachedAt)
        return 'cached';
    if (age <= ENTITLEMENT_FRESH_MS)
        return 'fresh';
    if (age <= 24 * 60 * 60 * 1000)
        return 'cached';
    return 'stale';
}
function getEffectiveRecommendedProfileKey() {
    return benchmarkSnapshot?.recommended_profile || runtimeProfilesPayload.recommended_profile;
}
function getEffectiveRecommendedProfile() {
    return getRuntimeProfile(getEffectiveRecommendedProfileKey());
}
function getEffectiveRecommendationReason() {
    if (!benchmarkSnapshot)
        return runtimeProfilesPayload.reason;
    const benchmarkProfile = getRuntimeProfile(benchmarkSnapshot.recommended_profile).label;
    const autoProfile = getRuntimeProfile(benchmarkSnapshot.auto_profile || runtimeProfilesPayload.recommended_profile).label;
    if (benchmarkSnapshot.recommended_profile === (benchmarkSnapshot.auto_profile || runtimeProfilesPayload.recommended_profile)) {
        return `Benchmark confirms the ${benchmarkProfile} profile for this workload.`;
    }
    return `Benchmark overrides the hardware heuristic: use ${benchmarkProfile} for this workload instead of the auto ${autoProfile} profile.`;
}
async function loadBenchmarkSnapshot() {
    const cached = await getJSON(BENCHMARK_CACHE_KEY);
    if (!cached || !cached.recommended_profile)
        return;
    benchmarkSnapshot = cached;
}
async function persistBenchmarkSnapshot(snapshot) {
    if (!snapshot) {
        await chrome.storage.local.remove(BENCHMARK_CACHE_KEY);
        return;
    }
    await setJSON(BENCHMARK_CACHE_KEY, { ...snapshot, benchmarked_at: Date.now() });
}
async function reconcileBenchmarkSnapshot() {
    if (!benchmarkSnapshot || !runtimeSnapshot.ok)
        return;
    if (benchmarkSnapshot.active_model === runtimeSnapshot.activeModel)
        return;
    benchmarkSnapshot = null;
    await persistBenchmarkSnapshot(null);
}
function renderResultBody() {
    clearNode(workflow);
    if (!workflow)
        return;
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
    if (resultTitleEl)
        resultTitleEl.textContent = title;
    if (resultMetaEl)
        resultMetaEl.textContent = meta;
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
function renderOutput({ title, eyebrow = 'Output', markdown, json, meta, exportBase, }) {
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
function triggerDownload(contents, filename, mimeType) {
    const blob = new Blob([contents], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}
function renderExports({ markdown, json, basename = 'selectpilot' }) {
    clearNode(exportsEl);
    if (!exportsEl)
        return;
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
async function request(type, payload = {}) {
    const res = await chrome.runtime.sendMessage({ type, ...payload });
    if (res?.error) {
        const err = new Error(String(res.error));
        err.code = res.errorCode;
        err.details = res.errorDetails;
        err.traceId = res.traceId;
        err.status = res.status;
        throw err;
    }
    return res;
}
function formatPanelError(errorLike) {
    const message = String(errorLike?.message || 'Request failed');
    const code = errorLike?.code ? String(errorLike.code) : '';
    const traceId = errorLike?.traceId ? String(errorLike.traceId) : '';
    if (code && traceId)
        return `${message} [${code}] · trace ${traceId}`;
    if (code)
        return `${message} [${code}]`;
    if (traceId)
        return `${message} · trace ${traceId}`;
    return message;
}
async function fetchHealth() {
    const res = await fetch(endpoints.health, { cache: 'no-store' });
    if (!res.ok)
        throw new Error(`Health check failed: ${res.status}`);
    return res.json();
}
async function fetchRuntimeProfiles() {
    const res = await fetch(endpoints.profiles, { cache: 'no-store' });
    if (!res.ok)
        throw new Error(`Profiles check failed: ${res.status}`);
    return (await res.json());
}
async function runRuntimeBenchmark() {
    const res = await fetch(endpoints.benchmark, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        cache: 'no-store',
    });
    if (!res.ok)
        throw new Error(`Benchmark failed: ${res.status}`);
    return (await res.json());
}
function renderMemoryState() {
    if (!memoryShellEl || !memoryStatusEl || !memoryMetaEl)
        return;
    const { tier, supported, enabled, entries } = memorySnapshot;
    const plural = entries === 1 ? '' : 's';
    if (!supported) {
        if (tier === 'plus') {
            memoryStatusEl.textContent = 'Memory OFF · Flow tier has connector exports without retention.';
            memoryMetaEl.textContent = 'Upgrade to Deep to enable explicit local retention controls (inspect/export/delete ledger).';
        }
        else {
            memoryStatusEl.textContent = 'Memory OFF · Core tier is extraction-only and stateless.';
            memoryMetaEl.textContent = 'Upgrade to Flow for connector exports, or Deep for persistent local knowledge.';
        }
    }
    else if (!enabled) {
        memoryStatusEl.textContent = 'Memory OFF · Deep retention is available but disabled.';
        memoryMetaEl.textContent = 'Enable memory to retain local events. You can inspect, export, and delete at any time.';
    }
    else {
        memoryStatusEl.textContent = `Memory ON · Deep retention active with ${entries} retained event${plural}.`;
        memoryMetaEl.textContent = `${formatMemoryUpdatedAt(memorySnapshot.lastUpdatedAt)} Inspect/export/delete stays fully local and user-controlled.`;
    }
    if (memoryToggleButtonEl) {
        memoryToggleButtonEl.textContent = enabled ? 'Disable memory' : 'Enable memory';
    }
}
function renderEntitlementStatus() {
    if (!entitlementStatusEl)
        return;
    const tier = entitlementSnapshot?.tier || 'essential';
    const token = entitlementSnapshot?.token;
    if (!token) {
        entitlementStatusEl.textContent = 'No entitlement token attached yet.';
        return;
    }
    const suffix = formatEntitlementUpdatedAt(entitlementSnapshot?.cachedAt);
    const cacheState = getEntitlementCacheState(entitlementSnapshot);
    entitlementStatusEl.textContent = `Token attached · tier ${tier} (${cacheState}) · ${suffix}`;
}
async function refreshEntitlementStatus() {
    try {
        entitlementSnapshot = await request('entitlement:get');
    }
    catch {
        entitlementSnapshot = null;
    }
    renderEntitlementStatus();
    syncControlAvailability();
}
async function doSyncOrderToken() {
    const orderId = orderIdInputEl?.value.trim() || '';
    if (!orderId)
        throw new Error('Order ID is required');
    setStatus('Checking order status...');
    const orderRes = await fetch(endpoints.billingOrderStatus(orderId), { cache: 'no-store' });
    if (!orderRes.ok) {
        if (orderRes.status === 404)
            throw new Error('No payment detected for this order ID');
        throw new Error(`Order lookup failed (${orderRes.status})`);
    }
    const order = await orderRes.json();
    if (!order.paid || !order.token) {
        const confirmations = order.confirmations || 0;
        const needed = order.confirmations_required || 0;
        throw new Error(`No payment detected yet (${confirmations}/${needed} confirmations)`);
    }
    if (entitlementSnapshot?.token && entitlementSnapshot.token === order.token) {
        await request('entitlement:refresh');
        await refreshEntitlementStatus();
        setStatus('Order already synced; entitlement refreshed');
        return;
    }
    await request('license:attach_token', { token: order.token });
    await request('entitlement:refresh');
    await refreshEntitlementStatus();
    setStatus('Token attached and entitlement refreshed');
}
async function refreshMemoryStatus() {
    try {
        memorySnapshot = await request('panel:memory_status');
    }
    catch {
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
    if (!res.ok)
        throw new Error(`Privacy proof failed: ${res.status}`);
    return (await res.json());
}
function syncControlAvailability() {
    const runtimeReady = runtimeSnapshot.ok;
    const selectionReady = selectionPreview.hasSelection;
    actionButtons.forEach((button) => {
        const requiresSelection = button.id === 'btn-extract' || button.id === 'btn-actions';
        button.disabled = isBusy || !runtimeReady || (requiresSelection && !selectionReady);
    });
    if (agentPromptEl)
        agentPromptEl.disabled = isBusy || !runtimeReady;
    if (extractPresetEl)
        extractPresetEl.disabled = isBusy || !runtimeReady || !selectionReady;
    if (intentInputEl)
        intentInputEl.disabled = isBusy || !runtimeReady || !selectionReady;
    if (refreshButtonEl)
        refreshButtonEl.disabled = isBusy;
    if (memoryToggleButtonEl)
        memoryToggleButtonEl.disabled = isBusy || !memorySnapshot.supported;
    const memoryActionsLocked = isBusy || !memorySnapshot.supported || !memorySnapshot.enabled;
    const flowExportSupported = memorySnapshot.tier !== 'essential';
    const hasTransientExportData = Boolean(lastResult?.readable || (lastResult?.structured && Object.keys(lastResult.structured).length > 0));
    const canExport = memorySnapshot.supported
        ? (memorySnapshot.entries > 0 || hasTransientExportData)
        : hasTransientExportData;
    if (memoryInspectButtonEl)
        memoryInspectButtonEl.disabled = memoryActionsLocked;
    if (memoryExportButtonEl)
        memoryExportButtonEl.disabled = isBusy || !flowExportSupported || !canExport;
    if (memoryDeleteButtonEl)
        memoryDeleteButtonEl.disabled = memoryActionsLocked || memorySnapshot.entries === 0;
    if (syncOrderButtonEl) {
        const hasOrderId = Boolean(orderIdInputEl?.value.trim());
        syncOrderButtonEl.disabled = isBusy || !hasOrderId;
    }
    if (intentExecuteButtonEl) {
        const hasIntent = Boolean(intentInputEl?.value.trim());
        intentExecuteButtonEl.disabled = isBusy || !runtimeReady || !selectionReady || !hasIntent;
    }
    if (intentClearButtonEl)
        intentClearButtonEl.disabled = isBusy;
}
function populatePresetOptions() {
    if (!extractPresetEl)
        return;
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
    if (extractHelpEl)
        extractHelpEl.textContent = preset.description;
}
function buildMetric(label, value) {
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
function createProfileCard(profile, recommendedKey, copyLabel = 'Copy command') {
    const card = document.createElement('div');
    card.className = 'profile-card';
    if (profile.key === recommendedKey)
        card.classList.add('is-recommended');
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
    stack.append(buildMetric('Generation', profile.generation_model), buildMetric('Embedding', profile.embedding_model), buildMetric('Latency', profile.target_latency));
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
    if (!runtimeStateEl)
        return;
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
        wrapper.append(buildMetric('Execution', 'Local-only ready'), buildMetric('Provider', 'Ollama on-device'), buildMetric('Ignored remote', `${runtimeSnapshot.ignoredRemoteCount} models`));
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
        }
        else {
            benchmarkCopy.textContent = 'Run a local benchmark to confirm that the current runtime matches the smallest viable profile for this machine.';
        }
        benchmarkBlock.append(benchmarkCopy);
        const benchmarkMetrics = document.createElement('div');
        benchmarkMetrics.className = 'runtime-grid';
        const efficiencyScore = getEfficiencyScore(benchmarkSnapshot);
        if (benchmarkSnapshot) {
            benchmarkMetrics.append(buildMetric('Extract JSON', `${benchmarkSnapshot.extract_latency_ms} ms`), buildMetric('Summarize', `${benchmarkSnapshot.summarize_latency_ms} ms`), buildMetric('Efficiency', `${efficiencyScore}/100`), buildMetric('Recommended', getEffectiveRecommendedProfile().label));
        }
        else {
            benchmarkMetrics.append(buildMetric('Extract JSON', 'Pending'), buildMetric('Summarize', 'Pending'), buildMetric('Efficiency', 'Pending'), buildMetric('Recommended', getEffectiveRecommendedProfile().label));
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
    wrapper.append(buildMetric('Recommended profile', recommended.label), buildMetric('Generation model', recommended.generation_model), buildMetric('Embedding model', recommended.embedding_model));
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
    if (!selectionCardEl)
        return;
    const header = document.createElement('div');
    header.className = 'output-eyebrow';
    header.textContent = selectionPreview.hasSelection ? 'Active selection' : 'No active selection';
    const title = document.createElement('h3');
    title.textContent = selectionPreview.title || 'Current page';
    const copy = document.createElement('p');
    copy.className = 'selection-copy';
    if (selectionPreview.hasSelection) {
        copy.textContent = shorten(selectionPreview.selection, 260);
    }
    else if (selectionPreview.pageText) {
        copy.textContent = 'Extract JSON requires highlighted text. Summarize and Ask can still fall back to page context.';
    }
    else {
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
    if (tierEl)
        tierEl.textContent = res.tier;
    setStatusBar(`Tier ${res.tier} · checking local runtime`);
}
async function refreshRuntime() {
    const startedAt = performance.now();
    try {
        try {
            runtimeProfilesPayload = await fetchRuntimeProfiles();
        }
        catch {
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
        setSelectionContext({
            executionBoundary: runtimeSnapshot.privacyMode,
            privacyMode: runtimeSnapshot.privacyMode,
        });
        if (truthExecutionEl)
            truthExecutionEl.textContent = runtimeSnapshot.ok ? 'Local' : 'Degraded';
        if (truthModelEl)
            truthModelEl.textContent = runtimeSnapshot.activeModel;
        if (truthBoundaryEl)
            truthBoundaryEl.textContent = runtimeSnapshot.privacyMode === 'local-only' ? 'Selected text stays local' : runtimeSnapshot.privacyMode;
        if (truthPrivacyEl) {
            const localOnly = !!privacyProofSnapshot?.ok && !privacyProofSnapshot?.outbound_observation?.external_calls_registered;
            truthPrivacyEl.textContent = localOnly ? 'Verified local-only' : 'Boundary degraded';
            setLeakageFeedback(localOnly ? 'No leakage detected' : 'Potential leakage detected', localOnly
                ? 'Core selected-text execution is verified local through Ollama on-device.'
                : (privacyProofSnapshot?.outbound_observation?.statement || 'External target observed. Inspect privacy-proof details.'));
        }
        if (truthPrivacyMetaEl)
            truthPrivacyMetaEl.textContent = formatPrivacyVerifiedAt(privacyProofSnapshot?.generated_at);
        if (truthProfileEl)
            truthProfileEl.textContent = getEffectiveRecommendedProfile().label;
        if (truthLatencyEl)
            truthLatencyEl.textContent = runtimeSnapshot.latencyMs ? `${runtimeSnapshot.latencyMs} ms` : 'Measured';
        setStatusBar(runtimeSnapshot.ok
            ? `${runtimeSnapshot.activeModel} ready in local Ollama · ${runtimeSnapshot.ignoredRemoteCount} remote models ignored`
            : `Runtime degraded · ${runtimeSnapshot.hint || 'local model required'}`);
        await reconcileBenchmarkSnapshot();
        renderRuntimeState();
    }
    catch (e) {
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
        if (truthExecutionEl)
            truthExecutionEl.textContent = 'Offline';
        if (truthModelEl)
            truthModelEl.textContent = 'Unavailable';
        if (truthBoundaryEl)
            truthBoundaryEl.textContent = 'Local-only pending';
        if (truthPrivacyEl)
            truthPrivacyEl.textContent = 'Unavailable';
        if (truthPrivacyMetaEl)
            truthPrivacyMetaEl.textContent = 'Awaiting proof';
        setLeakageFeedback('No leakage proof unavailable', 'Runtime is offline, so leakage verification has not been completed yet.');
        if (truthProfileEl)
            truthProfileEl.textContent = getEffectiveRecommendedProfile().label;
        if (truthLatencyEl)
            truthLatencyEl.textContent = 'Unavailable';
        setStatusBar(`Local runtime unavailable · setup required`);
        setStatus(runtimeSnapshot.error || 'Ollama health check failed');
        renderRuntimeState();
    }
    syncControlAvailability();
}
async function doSummarize() {
    setStatus('Summarizing selected text...');
    const res = await request('panel:summarize');
    if (res?.model_selection) {
        applyRuntimeEvent({
            taskFamily: 'summarize',
            selectedModel: String(res.model_selection.model || res.model || 'unknown'),
            selectionPath: res.model_selection.selection_path,
            policyVersion: res.model_selection.policy_version ?? null,
            executionGeography: 'local',
        });
    }
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
async function doExtract(presetKey) {
    const selectedPreset = getExtractionPreset(presetKey || extractPresetEl?.value);
    setStatus(`Extracting ${selectedPreset.label.toLowerCase()}...`);
    const res = await request('panel:extract', { preset: selectedPreset.key });
    if (res?.model_selection) {
        applyRuntimeEvent({
            taskFamily: 'extract',
            selectedModel: String(res.model_selection.model || res.model || 'unknown'),
            selectionPath: res.model_selection.selection_path,
            policyVersion: res.model_selection.policy_version ?? null,
            executionGeography: 'local',
        });
    }
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
    if (res?.model_selection) {
        applyRuntimeEvent({
            taskFamily: 'agent',
            selectedModel: String(res.model_selection.model || res.model || 'unknown'),
            selectionPath: res.model_selection.selection_path,
            policyVersion: res.model_selection.policy_version ?? null,
            executionGeography: 'local',
        });
    }
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
    if (truthProfileEl)
        truthProfileEl.textContent = getEffectiveRecommendedProfile().label;
    if (truthLatencyEl)
        truthLatencyEl.textContent = `${benchmarkSnapshot.extract_latency_ms} ms`;
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
    const target = memoryTargetEl?.value || 'generic';
    let entries = [];
    if (memorySnapshot.supported && memorySnapshot.enabled) {
        const res = await request('panel:memory_inspect');
        entries = (Array.isArray(res?.entries) ? res.entries : []);
    }
    else if (lastResult) {
        const inferredAction = lastResult.title.toLowerCase().includes('summary')
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
    const wrap = (fn) => async () => {
        isBusy = true;
        syncControlAvailability();
        try {
            await fn();
        }
        catch (e) {
            const text = formatPanelError(e);
            setStatus(text);
            setStatusBar(text);
        }
        finally {
            isBusy = false;
            syncControlAvailability();
            void Promise.all([refreshSelectionPreview(), refreshMemoryStatus(), refreshEntitlementStatus()]);
        }
    };
    refreshButtonEl?.addEventListener('click', () => {
        void Promise.all([refreshRuntime(), refreshSelectionPreview(), refreshMemoryStatus(), refreshEntitlementStatus()]);
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
    intentExecuteButtonEl?.addEventListener('click', wrap(() => doExecuteIntent()));
    intentClearButtonEl?.addEventListener('click', () => clearIntentInput());
    intentInputEl?.addEventListener('input', () => {
        selectedIntentSuggestion = null;
        syncControlAvailability();
    });
    intentInputEl?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter')
            return;
        event.preventDefault();
        void wrap(() => doExecuteIntent())();
    });
    syncOrderButtonEl?.addEventListener('click', wrap(() => doSyncOrderToken()));
    orderIdInputEl?.addEventListener('input', () => syncControlAvailability());
    $('#btn-transcribe')?.addEventListener('click', () => wrap(async () => {
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
    })());
    $('#btn-vision')?.addEventListener('click', () => wrap(async () => {
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
    })());
    extractPresetEl?.addEventListener('change', () => syncPresetHelp());
    runtimeStateEl?.addEventListener('click', (event) => {
        const target = event.target;
        if (!target)
            return;
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
        if (!lastResult?.structured)
            return;
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
    const topologyBindingErrors = [];
    for (const componentId of requiredTopologyComponents) {
        if (!getTopologyForComponent(componentId)) {
            topologyBindingErrors.push(`missing_topology:${componentId}`);
        }
    }
    if (!topologyValidation.ok || topologyBindingErrors.length) {
        setStatus(`Topology contract failed: ${[...topologyValidation.errors, ...topologyBindingErrors].join(', ')}`);
    }
    setVisiblePanels(['selection_surface', 'runtime_surface', 'report_surface']);
    renderRuntimeMetaOverlay();
    void connectRuntimeMetaStream();
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
