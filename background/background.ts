// module_name: background_background_ts
// spec_ref: "execution_layer"
import { compileIntent, extract, summarize } from '../api/nano-client.js';
import { runPipeline } from '../agent/agent-pipeline.js';
import { log, error } from '../utils/logger.js';
import { requireFeature, getLicenseTier, attachLicenseToken, refreshLicense } from './tier-service.js';
import { getEntitlementSnapshot } from './entitlement-service.js';
import { ApiRequestError } from '../api/request.js';
import type { AgentContext } from '../agent/agent-types.js';
import { FIRST_RUN_EXAMPLE } from '../shared/first-run-example.js';
import { getEncryptedJSON, setEncryptedJSON } from '../utils/storage.js';

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

async function openForActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || tab.windowId === undefined) throw new Error('active_tab_unavailable');
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content/content-script.bundle.js'],
  });
  await chrome.sidePanel.setOptions({ tabId: tab.id, path: 'panel/panel.html', enabled: true });
  await chrome.sidePanel.open({ windowId: tab.windowId });
}

chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-selectpilot') void openForActiveTab().catch((cause) => error('shortcut', 'open failed', cause));
});

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
  const encrypted = await getEncryptedJSON<MemoryEntry[]>(MEMORY_LEDGER_KEY);
  if (Array.isArray(encrypted)) return encrypted;

  // One-way, in-place migration from the pre-encryption schema.
  const stored = await chrome.storage.local.get(MEMORY_LEDGER_KEY);
  const legacy = stored[MEMORY_LEDGER_KEY];
  if (!Array.isArray(legacy)) return [];
  const bounded = legacy.slice(-200) as MemoryEntry[];
  await setEncryptedJSON(MEMORY_LEDGER_KEY, bounded);
  return bounded;
}

async function setMemoryLedger(entries: MemoryEntry[]): Promise<void> {
  await setEncryptedJSON(MEMORY_LEDGER_KEY, entries.slice(-200));
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
  const selection = await requestFromContent(tab.id, 'content:get_selection');

  const selectionText = (selection as any)?.text?.text || '';
  const url = (selection as any)?.text?.url || tab.url;
  const title = (selection as any)?.text?.title || tab.title;
  const pageColor = (selection as any)?.text?.pageColor;

  return {
    url: url || undefined,
    title: title || undefined,
    selection: selectionText || undefined,
    metadata: {
      capturedAt: Date.now(),
      pageColor,
    }
  };
}

async function handleSummarize(): Promise<any> {
  const { allowed } = await requireFeature('text_summarization');
  if (!allowed) throw new Error('Flow tier required for summarize');
  const context = await collectContext();
  const text = context.selection || context.markdown || '';
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

async function handleFirstRunExtract(): Promise<any> {
  const entitlement = await getEntitlementSnapshot();
  const { allowed } = await requireFeature('structured_extraction');
  if (!entitlement?.token || !allowed) {
    throw new Error('Paid license required for deterministic extraction');
  }
  return extract({
    text: FIRST_RUN_EXAMPLE.text,
    preset: FIRST_RUN_EXAMPLE.preset,
    url: FIRST_RUN_EXAMPLE.url,
    title: FIRST_RUN_EXAMPLE.title,
    metadata: {
      source: 'selectpilot_first_run',
      sample_version: FIRST_RUN_EXAMPLE.version,
    },
  });
}

async function handleAgent(prompt: string): Promise<any> {
  const { allowed } = await requireFeature('basic_local_agent');
  if (!allowed) throw new Error('Flow tier required for ask/rewrite transforms');
  const context = await collectContext();
  const content = context.selection || context.markdown || '';
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
    pageText: '',
    title: context.title || '',
    url: context.url || '',
    hasSelection: Boolean(context.selection && context.selection.trim()),
    pageColor: typeof context.metadata?.pageColor === 'string' ? context.metadata.pageColor : '',
  };
}

async function handleIntentCompile(intent: string): Promise<any> {
  const trimmed = String(intent || '').trim();
  if (!trimmed) throw new Error('Intent is required before compilation');

  const context = await collectContext();
  return compileIntent({
    intent: trimmed,
    has_selection: Boolean(context.selection && context.selection.trim()),
    has_page_text: false,
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === 'panel:summarize') {
        sendResponse(await handleSummarize());
        return;
      }
      if (msg.type === 'panel:extract') {
        sendResponse(await handleExtract(msg.preset));
        return;
      }
      if (msg.type === 'panel:extract_demo') {
        sendResponse(await handleFirstRunExtract());
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
