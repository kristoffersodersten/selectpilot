import { compileIntent, extract, summarize, transcribe, vision } from '../api/nano-client.js';
import { runPipeline } from '../agent/agent-pipeline.js';
import { log, error } from '../utils/logger.js';
import { requireFeature, getLicenseTier, attachLicenseToken, refreshLicense } from './tier-service.js';
import { getEntitlementSnapshot } from './entitlement-service.js';
import { ApiRequestError } from '../api/request.js';
import type { AgentContext } from '../agent/agent-types.js';

type MemoryEntry = {
  action: 'extract' | 'summarize' | 'agent';
  content?: string;
  summary?: string;
  url?: string;
  title?: string;
  sourceType?: 'web' | 'pdf' | 'text';
  sourceOrigin?: string;
  sourceTimestamp?: string;
  intent?: 'note' | 'insight' | 'task' | 'reference';
  tags?: string[];
  charCount: number;
  createdAt: number;
};

const MEMORY_ENABLED_KEY = 'selectpilot_memory_enabled_v1';
const MEMORY_LEDGER_KEY = 'selectpilot_memory_ledger_v1';

async function canUseProjectMemory(): Promise<boolean> {
  const { allowed } = await requireFeature('project_memory');
  return allowed;
}

async function getMemoryEnabled(): Promise<boolean> {
  const stored = await chrome.storage.local.get(MEMORY_ENABLED_KEY);
  return Boolean(stored[MEMORY_ENABLED_KEY]);
}

async function setMemoryEnabled(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ [MEMORY_ENABLED_KEY]: enabled });
}

async function getMemoryLedger(): Promise<MemoryEntry[]> {
  const stored = await chrome.storage.local.get(MEMORY_LEDGER_KEY);
  const entries = stored[MEMORY_LEDGER_KEY];
  return Array.isArray(entries) ? entries : [];
}

async function setMemoryLedger(entries: MemoryEntry[]): Promise<void> {
  await chrome.storage.local.set({ [MEMORY_LEDGER_KEY]: entries.slice(-200) });
}

async function recordMemoryEvent(entry: Omit<MemoryEntry, 'createdAt'>): Promise<void> {
  if (!(await canUseProjectMemory())) return;
  if (!(await getMemoryEnabled())) return;
  const ledger = await getMemoryLedger();
  ledger.push({ ...entry, createdAt: Date.now() });
  await setMemoryLedger(ledger);
}

function inferSourceType(url?: string): 'web' | 'pdf' | 'text' {
  if (!url) return 'text';
  return url.toLowerCase().includes('.pdf') ? 'pdf' : 'web';
}

function inferIntent(action: MemoryEntry['action']): MemoryEntry['intent'] {
  if (action === 'extract') return 'task';
  if (action === 'agent') return 'insight';
  return 'reference';
}

function compactSummary(text: string | undefined, max = 280): string {
  const value = (text || '').trim();
  if (!value) return '';
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

async function handleMemoryStatus() {
  const tier = await getLicenseTier();
  const enabled = await getMemoryEnabled();
  const ledger = await getMemoryLedger();
  return {
    tier,
    supported: await canUseProjectMemory(),
    enabled,
    entries: ledger.length,
    lastUpdatedAt: ledger.length ? ledger[ledger.length - 1].createdAt : null,
  };
}

async function handleMemoryToggle() {
  if (!(await canUseProjectMemory())) {
    throw new Error('Deep tier required for local memory controls');
  }
  const enabled = !(await getMemoryEnabled());
  await setMemoryEnabled(enabled);
  return handleMemoryStatus();
}

async function handleMemoryInspect() {
  if (!(await canUseProjectMemory())) {
    throw new Error('Deep tier required for local memory controls');
  }
  const ledger = await getMemoryLedger();
  return { entries: ledger };
}

async function handleMemoryExport() {
  if (!(await canUseProjectMemory())) {
    throw new Error('Deep tier required for local memory controls');
  }
  const ledger = await getMemoryLedger();
  const exportedAt = new Date().toISOString();
  return {
    filename: `selectpilot-memory-ledger-${Date.now()}.json`,
    contents: JSON.stringify({ exportedAt, entries: ledger }, null, 2),
  };
}

async function handleMemoryDelete() {
  if (!(await canUseProjectMemory())) {
    throw new Error('Deep tier required for local memory controls');
  }
  await setMemoryLedger([]);
  return handleMemoryStatus();
}

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function requestFromContent<T>(tabId: number, type: string): Promise<T | null> {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type });
    return res as T;
  } catch (e) {
    error('bg', 'content request failed', e);
    return null;
  }
}

async function collectContext(): Promise<AgentContext> {
  const tab = await getActiveTab();
  if (!tab?.id) return {};
  const [selection, doc, audio, video] = await Promise.all([
    requestFromContent(tab.id, 'content:get_selection'),
    requestFromContent(tab.id, 'content:get_document'),
    requestFromContent(tab.id, 'content:get_audio'),
    requestFromContent(tab.id, 'content:get_video')
  ]);

  const selectionText = (selection as any)?.text?.text || '';
  const documentText = (doc as any)?.documentText?.text || '';
  const url = (selection as any)?.text?.url || (doc as any)?.documentText?.url || tab.url;
  const title = (selection as any)?.text?.title || (doc as any)?.documentText?.title || tab.title;

  return {
    url: url || undefined,
    title: title || undefined,
    selection: selectionText || undefined,
    pageText: documentText || undefined,
    media: {
      audio: (audio as any)?.audio?.audioUrl,
      videoFrame: (video as any)?.video?.frame,
      image: (video as any)?.video?.poster
    },
    metadata: {
      audioDuration: (audio as any)?.audio?.duration,
      videoDuration: (video as any)?.video?.duration,
      capturedAt: Date.now()
    }
  };
}

async function handleSummarize(): Promise<any> {
  const { allowed } = await requireFeature('text_summarization');
  if (!allowed) throw new Error('Flow tier required for summarize');
  const context = await collectContext();
  const text = context.selection || context.pageText || context.markdown || '';
  const payload = { text, url: context.url, title: context.title, metadata: context.metadata };
  const result = await summarize(payload);
  const sourceOrigin = context.url || 'local-context';
  await recordMemoryEvent({
    action: 'summarize',
    content: text,
    summary: compactSummary(result?.summary || result?.markdown),
    url: context.url,
    title: context.title,
    sourceType: inferSourceType(context.url),
    sourceOrigin,
    sourceTimestamp: new Date().toISOString(),
    intent: inferIntent('summarize'),
    tags: ['summarize', 'local-only'],
    charCount: text.length,
  });
  return result;
}

async function handleExtract(preset?: string): Promise<any> {
  const context = await collectContext();
  const text = context.selection || '';
  if (!text.trim()) throw new Error('Highlight text before extracting structured output');
  const result = await extract({ text, preset, url: context.url, title: context.title, metadata: context.metadata });
  const sourceOrigin = context.url || 'local-context';
  await recordMemoryEvent({
    action: 'extract',
    content: text,
    summary: compactSummary(result?.markdown || result?.label),
    url: context.url,
    title: context.title,
    sourceType: inferSourceType(context.url),
    sourceOrigin,
    sourceTimestamp: new Date().toISOString(),
    intent: inferIntent('extract'),
    tags: ['extract', preset || 'default', 'local-only'].filter(Boolean),
    charCount: text.length,
  });
  return result;
}

async function handleTranscribe(): Promise<any> {
  const { allowed } = await requireFeature('audio_transcription');
  if (!allowed) throw new Error('Feature blocked: upgrade tier for audio transcription');
  const context = await collectContext();
  if (!context.media?.audio) throw new Error('No audio element detected on page');
  return transcribe({ audioUrl: context.media.audio, metadata: context.metadata });
}

async function handleVision(): Promise<any> {
  const { allowed } = await requireFeature('image_ocr');
  if (!allowed) throw new Error('Feature blocked: upgrade tier for vision OCR');
  const context = await collectContext();
  const image = context.media?.videoFrame || context.media?.image;
  if (!image) throw new Error('No image or video frame available');
  return vision({ imageBase64: image, url: context.url, metadata: context.metadata });
}

async function handleAgent(prompt: string): Promise<any> {
  const { allowed } = await requireFeature('basic_local_agent');
  if (!allowed) throw new Error('Flow tier required for ask/rewrite transforms');
  const context = await collectContext();
  const content = context.selection || context.pageText || context.markdown || '';
  const result = await runPipeline(content, context, prompt);
  const sourceOrigin = context.url || 'local-context';
  await recordMemoryEvent({
    action: 'agent',
    content,
    summary: compactSummary(result?.markdown),
    url: context.url,
    title: context.title,
    sourceType: inferSourceType(context.url),
    sourceOrigin,
    sourceTimestamp: new Date().toISOString(),
    intent: inferIntent('agent'),
    tags: ['agent', 'local-only'],
    charCount: content.length,
  });
  return result;
}

async function handleSelectionPreview(): Promise<any> {
  const context = await collectContext();
  return {
    selection: context.selection || '',
    pageText: context.pageText || '',
    title: context.title || '',
    url: context.url || '',
    hasSelection: Boolean(context.selection && context.selection.trim()),
  };
}

async function handleIntentCompile(intent: string): Promise<any> {
  const trimmed = String(intent || '').trim();
  if (!trimmed) throw new Error('Intent is required before compilation');

  const context = await collectContext();
  return compileIntent({
    intent: trimmed,
    has_selection: Boolean(context.selection && context.selection.trim()),
    has_page_text: Boolean(context.pageText && context.pageText.trim()),
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === 'panel:summarize') {
        sendResponse(await handleSummarize());
        return;
      }
      if (msg.type === 'panel:transcribe') {
        sendResponse(await handleTranscribe());
        return;
      }
      if (msg.type === 'panel:extract') {
        sendResponse(await handleExtract(msg.preset));
        return;
      }
      if (msg.type === 'panel:vision') {
        sendResponse(await handleVision());
        return;
      }
      if (msg.type === 'panel:agent') {
        sendResponse(await handleAgent(msg.prompt));
        return;
      }
      if (msg.type === 'panel:get_tier') {
        sendResponse({ tier: await getLicenseTier() });
        return;
      }
      if (msg.type === 'entitlement:get') {
        sendResponse(await getEntitlementSnapshot());
        return;
      }
      if (msg.type === 'entitlement:refresh') {
        sendResponse(await refreshLicense(true));
        return;
      }
      if (msg.type === 'license:attach_token') {
        if (!msg.token || typeof msg.token !== 'string') throw new Error('Missing token');
        sendResponse(await attachLicenseToken(msg.token));
        return;
      }
      if (msg.type === 'panel:get_selection_preview') {
        sendResponse(await handleSelectionPreview());
        return;
      }
      if (msg.type === 'panel:intent_compile') {
        sendResponse(await handleIntentCompile(msg.intent));
        return;
      }
      if (msg.type === 'panel:memory_status') {
        sendResponse(await handleMemoryStatus());
        return;
      }
      if (msg.type === 'panel:memory_toggle') {
        sendResponse(await handleMemoryToggle());
        return;
      }
      if (msg.type === 'panel:memory_inspect') {
        sendResponse(await handleMemoryInspect());
        return;
      }
      if (msg.type === 'panel:memory_export') {
        sendResponse(await handleMemoryExport());
        return;
      }
      if (msg.type === 'panel:memory_delete') {
        sendResponse(await handleMemoryDelete());
        return;
      }
    } catch (e: any) {
      error('bg', e?.message || e);
      if (e instanceof ApiRequestError) {
        sendResponse({
          error: e.message || 'Unknown API error',
          errorCode: e.code || 'api_error',
          errorDetails: e.details || null,
          traceId: e.traceId || null,
          status: e.status,
        });
        return;
      }
      sendResponse({
        error: e?.message || 'Unknown error',
        errorCode: e?.code || 'unknown_error',
        errorDetails: e?.details || null,
        traceId: e?.traceId || e?.details?.trace_id || null,
      });
    }
  })();
  return true;
});

void refreshLicense(false);
setInterval(() => {
  void refreshLicense(false);
}, 10 * 60 * 1000);

log('bg', 'service worker ready');
