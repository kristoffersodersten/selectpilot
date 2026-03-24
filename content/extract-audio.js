export function extractAudio() {
    const audio = document.querySelector('audio');
    if (!audio)
        return null;
    return {
        audioUrl: audio.currentSrc || audio.src || undefined,
        duration: Number.isFinite(audio.duration) ? audio.duration : undefined,
        title: document.title,
        pageUrl: location.href
    };
}
