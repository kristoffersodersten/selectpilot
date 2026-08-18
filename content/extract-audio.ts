// module_name: content_extract-audio_ts
// spec_ref: "execution_layer"
export type AudioExtraction = {
  audioUrl?: string;
  duration?: number;
  title?: string;
  pageUrl: string;
};

// @spec_ref execution_layer
export function extractAudio(): AudioExtraction | null {
  const audio = document.querySelector('audio');
  if (!audio) return null;
  return {
    audioUrl: audio.currentSrc || audio.src || undefined,
    duration: Number.isFinite(audio.duration) ? audio.duration : undefined,
    title: document.title,
    pageUrl: location.href
  };
}
