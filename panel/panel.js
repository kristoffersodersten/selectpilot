import { $ } from '../utils/dom.js';
import { EXTRACTION_PRESETS, getExtractionPreset } from './extraction-presets.js';
const workflow = $('#workflow');
const exportsEl = $('#exports');
const statusEl = $('#status');
const tierEl = $('#tier');
const statusBar = $('#status-bar');
const agentPromptEl = $('#agent-prompt');
const extractPresetEl = $('#extract-preset');
const extractHelpEl = $('#extract-help');
const actionButtons = Array.from(document.querySelectorAll('.actions button, .advanced-grid button'));
function setStatus(text) {
    if (statusEl)
        statusEl.textContent = text;
}
function setStatusBar(text) {
    if (statusBar)
        statusBar.textContent = text;
}
function setBusy(isBusy) {
    actionButtons.forEach((button) => {
        button.disabled = isBusy;
    });
    if (agentPromptEl)
        agentPromptEl.disabled = isBusy;
    if (extractPresetEl)
        extractPresetEl.disabled = isBusy;
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
function renderOutput({ title, eyebrow = 'Output', markdown, json, meta }) {
    clearNode(workflow);
    if (!workflow)
        return;
    const grid = document.createElement('div');
    grid.className = 'output-grid';
    grid.append(createCard(eyebrow, title, markdown || 'No output produced.'));
    if (json && Object.keys(json).length > 0) {
        grid.append(createCard('Structured Output', 'JSON', JSON.stringify(json, null, 2)));
    }
    if (meta) {
        const metaEl = document.createElement('div');
        metaEl.className = 'output-meta';
        metaEl.textContent = meta;
        grid.append(metaEl);
    }
    workflow.append(grid);
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
async function refreshTier() {
    const res = await request('panel:get_tier');
    if (tierEl)
        tierEl.textContent = res.tier;
    setStatusBar(`Tier ${res.tier} · local-only boundary · checking Ollama…`);
}
async function refreshRuntime() {
    try {
        const health = await fetchHealth();
        const model = health?.ollama?.active_model || 'unknown';
        const ignoredRemote = Array.isArray(health?.ollama?.ignored_remote_models) ? health.ollama.ignored_remote_models.length : 0;
        const status = health?.ok ? 'ready' : 'degraded';
        setStatusBar(`Tier ${tierEl?.textContent || 'essential'} · local-only ${status} · ${model} · ${ignoredRemote} remote models ignored`);
    }
    catch (e) {
        setStatusBar(`Tier ${tierEl?.textContent || 'essential'} · Ollama unavailable`);
        setStatus(e?.message || 'Ollama health check failed');
    }
}
async function doSummarize() {
    setStatus('Summarizing selected text...');
    const res = await request('panel:summarize');
    renderOutput({
        title: 'Summary',
        markdown: res.markdown || res.summary || '',
        eyebrow: 'Selected text',
        meta: 'Human-friendly summary generated locally from the current selection.'
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
        meta: `${res.description || selectedPreset.description} This is the reusable local execution path.`
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
        meta: 'Freeform local transform using the current custom prompt.'
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
        meta: 'General-purpose local answer using the selected text as context.'
    });
    renderExports({ markdown, json: res.json || {}, basename: 'selectpilot-answer' });
    setStatus('Done');
}
function bindActions() {
    const wrap = (fn) => async () => {
        setBusy(true);
        try {
            await fn();
        }
        catch (e) {
            setStatus(e?.message || 'Request failed');
        }
        finally {
            setBusy(false);
        }
    };
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
            meta: 'Experimental audio path.'
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
            meta: 'Experimental OCR / image signature path.'
        });
        renderExports({ markdown: res.text || '', basename: 'selectpilot-vision' });
        setStatus('Done');
    })());
    extractPresetEl?.addEventListener('change', () => syncPresetHelp());
}
populatePresetOptions();
bindActions();
refreshTier();
refreshRuntime();
