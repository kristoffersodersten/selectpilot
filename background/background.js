import { summarize, transcribe, vision } from '../api/nano-client.js';
import { runPipeline } from '../agent/agent-pipeline.js';
import { log, error } from '../utils/logger.js';
import { requireFeature, getLicenseTier } from './tier-service.js';
async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab || null;
}
async function requestFromContent(tabId, type) {
    try {
        // @ts-ignore
        const res = await chrome.tabs.sendMessage(tabId, { type });
        return res;
    }
    catch (e) {
        error('bg', 'content request failed', e);
        return null;
    }
}
async function collectContext() {
    const tab = await getActiveTab();
    if (!tab?.id)
        return {};
    const [selection, doc, audio, video] = await Promise.all([
        requestFromContent(tab.id, 'content:get_selection'),
        requestFromContent(tab.id, 'content:get_document'),
        requestFromContent(tab.id, 'content:get_audio'),
        requestFromContent(tab.id, 'content:get_video')
    ]);
    const text = selection?.text?.text || doc?.documentText?.text || '';
    const url = selection?.text?.url || doc?.documentText?.url || tab.url;
    const title = selection?.text?.title || doc?.documentText?.title || tab.title;
    return {
        url: url || undefined,
        title: title || undefined,
        selection: text,
        media: {
            audio: audio?.audio?.audioUrl,
            videoFrame: video?.video?.frame,
            image: video?.video?.poster
        },
        metadata: {
            audioDuration: audio?.audio?.duration,
            videoDuration: video?.video?.duration,
            capturedAt: Date.now()
        }
    };
}
async function handleSummarize() {
    const context = await collectContext();
    const text = context.selection || context.markdown || '';
    const payload = { text, url: context.url, title: context.title, metadata: context.metadata };
    return summarize(payload);
}
async function handleTranscribe() {
    const { allowed } = await requireFeature('audio_transcription');
    if (!allowed)
        throw new Error('Feature blocked: upgrade tier for audio transcription');
    const context = await collectContext();
    if (!context.media?.audio)
        throw new Error('No audio element detected on page');
    return transcribe({ audioUrl: context.media.audio, metadata: context.metadata });
}
async function handleVision() {
    const { allowed } = await requireFeature('image_ocr');
    if (!allowed)
        throw new Error('Feature blocked: upgrade tier for vision OCR');
    const context = await collectContext();
    const image = context.media?.videoFrame || context.media?.image;
    if (!image)
        throw new Error('No image or video frame available');
    return vision({ imageBase64: image, url: context.url, metadata: context.metadata });
}
async function handleAgent(prompt) {
    const tier = await getLicenseTier();
    if (tier === 'essential')
        throw new Error('Agent requires plus or pro tier');
    const context = await collectContext();
    const content = context.selection || context.markdown || '';
    return runPipeline(content, context, prompt);
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
        }
        catch (e) {
            error('bg', e?.message || e);
            sendResponse({ error: e?.message || 'Unknown error' });
        }
    })();
    return true;
});
log('bg', 'service worker ready');
