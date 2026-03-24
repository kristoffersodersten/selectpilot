export type VideoExtraction = {
  poster?: string;
  currentTime?: number;
  duration?: number;
  frame?: string;
  pageUrl: string;
};

async function captureFrame(video: HTMLVideoElement): Promise<string | undefined> {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } catch (e) {
    console.error('frame capture failed', e);
    return undefined;
  }
}

export async function extractVideo(): Promise<VideoExtraction | null> {
  const video = document.querySelector('video');
  if (!video) return null;
  return {
    poster: (video as HTMLVideoElement).poster || undefined,
    currentTime: video.currentTime,
    duration: Number.isFinite(video.duration) ? video.duration : undefined,
    frame: await captureFrame(video),
    pageUrl: location.href
  };
}
