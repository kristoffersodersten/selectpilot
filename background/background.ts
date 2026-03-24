import { extract, summarize, transcribe, vision } from '../api/nano-client.js';
import { runPipeline } from '../agent/agent-pipeline.js';
import { log, error } from '../utils/logger.js';
import { requireFeature, getLicenseTier } from './tier-service.js';
import type { AgentContext } from '../agent/agent-types.js';

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
  const context = await collectContext();
  const text = context.selection || context.pageText || context.markdown || '';
  const payload = { text, url: context.url, title: context.title, metadata: context.metadata };
  return summarize(payload);
}

async function handleExtract(preset?: string): Promise<any> {
  const context = await collectContext();
  const text = context.selection || '';
  if (!text.trim()) throw new Error('Highlight text before extracting structured output');
  return extract({ text, preset, url: context.url, title: context.title, metadata: context.metadata });
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
  const tier = await getLicenseTier();
  if (tier === 'essential') throw new Error('Agent requires plus or pro tier');
  const context = await collectContext();
  const content = context.selection || context.pageText || context.markdown || '';
  return runPipeline(content, context, prompt);
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
      if (msg.type === 'panel:get_selection_preview') {
        sendResponse(await handleSelectionPreview());
        return;
      }
    } catch (e: any) {
      error('bg', e?.message || e);
      sendResponse({ error: e?.message || 'Unknown error' });
    }
  })();
  return true;
});

log('bg', 'service worker ready');
