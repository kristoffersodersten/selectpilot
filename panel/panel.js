import { $ } from '../utils/dom.js';
import { EXTRACTION_PRESETS, getExtractionPreset } from './extraction-presets.js';
const workflow = $('#workflow');
const exportsEl = $('#exports');
const runtimeStateEl = $('#runtime-state');
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
const truthProfileEl = $('#truth-profile');
const truthLatencyEl = $('#truth-latency');
const actionButtons = Array.from(document.querySelectorAll('.primary-action, .secondary-grid button, .advanced-grid button'));
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
const FAST_INSTALL_COMMANDS = [
    'ollama pull qwen2.5:0.5b',
    'ollama pull nomic-embed-text-v2-moe:latest',
    'CHROMEAI_OLLAMA_MODEL=qwen2.5:0.5b ./scripts/install-macos-local.sh',
].join('\n');
function setStatus(text) {
    if (statusEl)
        statusEl.textContent = text;
}
function setStatusBar(text) {
    if (statusBar)
        statusBar.textContent = text;
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
function deriveProfile(model) {
    const normalized = model.toLowerCase();
    if (!normalized || normalized === 'unknown' || normalized === 'unavailable')
        return 'Pending';
    if (normalized.includes('0.5b') || normalized.includes('1b') || normalized.includes('mini') || normalized.includes('small'))
        return 'Fast';
    if (normalized.includes('70b') || normalized.includes('120b') || normalized.includes('advanced') || normalized.includes('coder'))
        return 'Advanced';
    return 'Balanced';
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
    const hasStructured = Boolean(lastResult?.structured && Object.keys(lastResult.structured).length > 0);
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
    if (res?.error)
        throw new Error(res.error);
    return res;
}
async function fetchHealth() {
    const res = await fetch('http://chromeai.local/health', { cache: 'no-store' });
    if (!res.ok)
        throw new Error(`Health check failed: ${res.status}`);
    return res.json();
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
    if (refreshButtonEl)
        refreshButtonEl.disabled = isBusy;
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
function renderRuntimeState() {
    clearNode(runtimeStateEl);
    if (!runtimeStateEl)
        return;
    runtimeStateEl.classList.add('is-visible');
    if (runtimeSnapshot.ok) {
        const wrapper = document.createElement('div');
        wrapper.className = 'runtime-grid';
        const metrics = [
            ['Execution', 'Local-only ready'],
            ['Provider', 'Ollama on-device'],
            ['Ignored remote', `${runtimeSnapshot.ignoredRemoteCount} models`],
        ];
        for (const [label, value] of metrics) {
            const metric = document.createElement('div');
            metric.className = 'runtime-metric';
            metric.innerHTML = `<span class="section-kicker">${label}</span><strong>${value}</strong>`;
            wrapper.append(metric);
        }
        const copy = document.createElement('p');
        copy.className = 'runtime-copy';
        copy.textContent = `Runtime ready. ${runtimeSnapshot.activeModel} is active locally, and the selected-text path stays inside the local bridge.`;
        runtimeStateEl.append(wrapper, copy);
        return;
    }
    const header = document.createElement('div');
    header.className = 'output-card';
    header.innerHTML = '<div class="output-eyebrow">Human intervention</div><h3>Local runtime not ready</h3>';
    const copy = document.createElement('p');
    copy.className = 'runtime-copy';
    copy.textContent =
        'SelectPilot needs a local Ollama runtime before the execution layer can run. Start with the smallest viable profile, then re-check the boundary.';
    const list = document.createElement('ol');
    list.className = 'setup-list';
    [
        'Install Ollama if it is missing.',
        'Pull the Fast profile models for extraction and embeddings.',
        'Run the local bootstrap script from this repo.',
        'Return here and press Refresh.',
    ].forEach((item) => {
        const li = document.createElement('li');
        li.textContent = item;
        list.append(li);
    });
    const wrapper = document.createElement('div');
    wrapper.className = 'runtime-grid';
    const metrics = [
        ['Recommended profile', 'Fast'],
        ['Generation model', 'qwen2.5:0.5b'],
        ['Embedding model', 'nomic-embed-text-v2-moe:latest'],
    ];
    for (const [label, value] of metrics) {
        const metric = document.createElement('div');
        metric.className = 'runtime-metric';
        metric.innerHTML = `<span class="section-kicker">${label}</span><strong>${value}</strong>`;
        wrapper.append(metric);
    }
    const actions = document.createElement('div');
    actions.className = 'runtime-actions';
    const copySetup = document.createElement('button');
    copySetup.type = 'button';
    copySetup.textContent = 'Copy setup commands';
    copySetup.addEventListener('click', async () => {
        await navigator.clipboard.writeText(FAST_INSTALL_COMMANDS);
        setStatus('Setup commands copied');
    });
    actions.append(copySetup);
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
        runtimeStateEl.append(header, copy, wrapper, list, actions, note);
        return;
    }
    runtimeStateEl.append(header, copy, wrapper, list, actions);
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
    renderSelectionState();
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
        const health = await fetchHealth();
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
        if (truthExecutionEl)
            truthExecutionEl.textContent = runtimeSnapshot.ok ? 'Local' : 'Degraded';
        if (truthModelEl)
            truthModelEl.textContent = runtimeSnapshot.activeModel;
        if (truthBoundaryEl)
            truthBoundaryEl.textContent = runtimeSnapshot.privacyMode === 'local-only' ? 'Selected text stays local' : runtimeSnapshot.privacyMode;
        if (truthProfileEl)
            truthProfileEl.textContent = deriveProfile(runtimeSnapshot.activeModel);
        if (truthLatencyEl)
            truthLatencyEl.textContent = runtimeSnapshot.latencyMs ? `${runtimeSnapshot.latencyMs} ms` : 'Measured';
        setStatusBar(runtimeSnapshot.ok
            ? `${runtimeSnapshot.activeModel} ready locally · ${runtimeSnapshot.ignoredRemoteCount} remote models ignored`
            : `Runtime degraded · ${runtimeSnapshot.hint || 'local model required'}`);
        renderRuntimeState();
    }
    catch (e) {
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
        if (truthProfileEl)
            truthProfileEl.textContent = 'Fast';
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
function bindActions() {
    const wrap = (fn) => async () => {
        isBusy = true;
        syncControlAvailability();
        try {
            await fn();
        }
        catch (e) {
            setStatus(e?.message || 'Request failed');
        }
        finally {
            isBusy = false;
            syncControlAvailability();
            void refreshSelectionPreview();
        }
    };
    refreshButtonEl?.addEventListener('click', () => {
        void Promise.all([refreshRuntime(), refreshSelectionPreview()]);
    });
    $('#btn-extract')?.addEventListener('click', wrap(() => doExtract()));
    $('#btn-summarize')?.addEventListener('click', wrap(() => doSummarize()));
    $('#btn-rewrite')?.addEventListener('click', wrap(() => doRewrite()));
    $('#btn-actions')?.addEventListener('click', wrap(() => doActions()));
    $('#btn-ask')?.addEventListener('click', wrap(() => doAsk()));
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
        void Promise.all([refreshRuntime(), refreshSelectionPreview()]);
    });
}
populatePresetOptions();
bindActions();
refreshTier();
renderRuntimeState();
renderSelectionState();
updateResultChrome();
renderResultBody();
renderExports({});
void Promise.all([refreshRuntime(), refreshSelectionPreview()]);
