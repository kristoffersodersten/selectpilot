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

function renderOutput(title: string, body: string) {
  setHTML(workflow, `<h3>${title}</h3><pre>${body}</pre>`);
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
    a.download = 'chromeai.md';
    a.click();
  });
}

async function request(type: string, payload: Record<string, unknown> = {}) {
  const res = await chrome.runtime.sendMessage({ type, ...payload });
  if (res?.error) throw new Error(res.error);
  return res;
}

async function refreshTier() {
  const res = await request('panel:get_tier');
  if (tierEl) tierEl.textContent = res.tier;
  setStatusBar(`Tier ${res.tier} · multimodal ready`);
}

async function doSummarize() {
  setStatus('Summarizing...');
  const res = await request('panel:summarize');
  renderOutput('Summary', res.summary || res.markdown || '');
  renderExports(res.markdown || res.summary || '');
  setStatus('Done');
}

async function doTranscribe() {
  setStatus('Transcribing audio...');
  const res = await request('panel:transcribe');
  renderOutput('Transcription', res.text || '');
  renderExports(res.text || '');
  setStatus('Done');
}

async function doVision() {
  setStatus('Processing vision OCR...');
  const res = await request('panel:vision');
  renderOutput('Vision', res.text || '');
  renderExports(res.text || '');
  setStatus('Done');
}

async function doAgent() {
  const prompt = agentPromptEl?.value.trim() || 'Reason over the captured context and produce structured output.';
  setStatus('Running agent...');
  const res = await request('panel:agent', { prompt });
  const markdown = res.markdown || '';
  renderOutput('Agent', markdown);
  renderExports(markdown);
  setHTML(exportsEl, exportsEl?.innerHTML + `<pre>${JSON.stringify(res.json, null, 2)}</pre>`);
  setStatus('Done');
}

function bindActions() {
  $('#btn-summarize')?.addEventListener('click', () => doSummarize().catch((e) => setStatus(e.message)));
  $('#btn-transcribe')?.addEventListener('click', () => doTranscribe().catch((e) => setStatus(e.message)));
  $('#btn-vision')?.addEventListener('click', () => doVision().catch((e) => setStatus(e.message)));
  $('#btn-agent')?.addEventListener('click', () => doAgent().catch((e) => setStatus(e.message)));
}

bindActions();
refreshTier();
setStatusBar('Multimodal capture idle');
