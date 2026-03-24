import { $, setHTML } from '../utils/dom.js';

const workflow = $('#workflow');
const exportsEl = $('#exports');
const statusEl = $('#status');
const tierEl = $('#tier');
const statusBar = $('#status-bar');
const agentPromptEl = $('#agent-prompt') as HTMLTextAreaElement | null;

function setStatus(text: string) {
  if (statusEl) statusEl.textContent = text;
}

function setStatusBar(text: string) {
  if (statusBar) statusBar.textContent = text;
}

function renderOutput(title: string, body: string, eyebrow = 'Output') {
  setHTML(
    workflow,
    `<div class="output-card"><div class="output-eyebrow">${eyebrow}</div><h3>${title}</h3><pre>${body}</pre></div>`
  );
}

function renderExports(markdown: string) {
  setHTML(exportsEl, `<button id="copy-md">Copy Markdown</button><button id="download-md">Download .md</button>`);
  $('#copy-md')?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(markdown);
    setStatus('Markdown copied');
  });
  $('#download-md')?.addEventListener('click', () => {
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'selectpilot.md';
    a.click();
  });
}

async function request(type: string, payload: Record<string, unknown> = {}) {
  const res = await chrome.runtime.sendMessage({ type, ...payload });
  if (res?.error) throw new Error(res.error);
  return res;
}

async function fetchHealth() {
  const res = await fetch('http://chromeai.local/health', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

async function refreshTier() {
  const res = await request('panel:get_tier');
  if (tierEl) tierEl.textContent = res.tier;
  setStatusBar(`Tier ${res.tier} · checking Ollama…`);
}

async function refreshRuntime() {
  try {
    const health = await fetchHealth();
    const model = health?.ollama?.active_model || 'unknown';
    const status = health?.ok ? 'ready' : 'degraded';
    setStatusBar(`Tier ${tierEl?.textContent || 'essential'} · Ollama ${status} · ${model}`);
  } catch (e: any) {
    setStatusBar(`Tier ${tierEl?.textContent || 'essential'} · Ollama unavailable`);
    setStatus(e?.message || 'Ollama health check failed');
  }
}

async function doSummarize() {
  setStatus('Summarizing selected text...');
  const res = await request('panel:summarize');
  renderOutput('Summary', res.summary || res.markdown || '', 'Selected text');
  renderExports(res.markdown || res.summary || '');
  setStatus('Done');
}

async function doRewrite() {
  const prompt = agentPromptEl?.value.trim() || 'Rewrite the selected text in clearer, tighter language.';
  setStatus('Rewriting...');
  const res = await request('panel:agent', { prompt });
  const markdown = res.markdown || '';
  renderOutput('Rewrite', markdown, 'Prompted transform');
  renderExports(markdown);
  setStatus('Done');
}

async function doActions() {
  const prompt = agentPromptEl?.value.trim() || 'Extract concrete action items, decisions, and follow-ups from the selected text.';
  setStatus('Extracting actions...');
  const res = await request('panel:agent', { prompt });
  const markdown = res.markdown || '';
  renderOutput('Action Items', markdown, 'Selected text');
  renderExports(markdown);
  setStatus('Done');
}

async function doAsk() {
  const prompt = agentPromptEl?.value.trim() || 'Answer the question using the selected text as context.';
  setStatus('Asking Ollama...');
  const res = await request('panel:agent', { prompt });
  const markdown = res.markdown || '';
  renderOutput('Answer', markdown, 'Local model');
  renderExports(markdown);
  setHTML(exportsEl, exportsEl?.innerHTML + `<pre>${JSON.stringify(res.json, null, 2)}</pre>`);
  setStatus('Done');
}

function bindActions() {
  $('#btn-summarize')?.addEventListener('click', () => doSummarize().catch((e) => setStatus(e.message)));
  $('#btn-rewrite')?.addEventListener('click', () => doRewrite().catch((e) => setStatus(e.message)));
  $('#btn-actions')?.addEventListener('click', () => doActions().catch((e) => setStatus(e.message)));
  $('#btn-ask')?.addEventListener('click', () => doAsk().catch((e) => setStatus(e.message)));
  $('#btn-transcribe')?.addEventListener('click', () =>
    request('panel:transcribe')
      .then((res) => {
        renderOutput('Transcription', res.text || '', 'Advanced');
        renderExports(res.text || '');
        setStatus('Done');
      })
      .catch((e) => setStatus(e.message))
  );
  $('#btn-vision')?.addEventListener('click', () =>
    request('panel:vision')
      .then((res) => {
        renderOutput('Vision', res.text || '', 'Advanced');
        renderExports(res.text || '');
        setStatus('Done');
      })
      .catch((e) => setStatus(e.message))
  );
}

bindActions();
refreshTier();
refreshRuntime();
