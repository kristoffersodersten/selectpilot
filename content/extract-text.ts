export type TextExtraction = {
  text: string;
  url: string;
  title: string;
};

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Recursively collects visible text from shadow DOM subtrees.
 * Extensions such as Monica.im and Cline inject their UI into open shadow
 * roots, which are invisible to a regular element's innerText.  Walking the
 * shadow tree explicitly lets us surface that text for summarise / agent
 * workflows.
 */
export function collectShadowText(root: Element | ShadowRoot): string {
  const parts: string[] = [];
  for (const el of Array.from(root.querySelectorAll('*'))) {
    if (el.shadowRoot) {
      // ShadowRoot has no innerText; collect from its direct Element children.
      for (const child of Array.from(el.shadowRoot.children)) {
        if (child instanceof HTMLElement) {
          const t = child.innerText;
          if (t && t.trim()) {
            parts.push(t);
          }
        }
      }
      // Recurse so nested shadow roots are also captured.
      const nested = collectShadowText(el.shadowRoot);
      if (nested) {
        parts.push(nested);
      }
    }
  }
  return parts.join('\n');
}

export function extractSelection(): TextExtraction {
  const selection = window.getSelection();
  let text = selection ? selection.toString() : '';

  // Fallback for shadow-DOM selections.  Chrome 111+ exposes getComposedRanges()
  // which crosses shadow-root boundaries.  Extensions like Monica.im and Cline
  // render their chat UI inside open shadow roots; on some configurations
  // selection.toString() returns an empty string even though a non-collapsed
  // composed range exists.  When that happens we attempt a live-range conversion
  // so the selection text is not silently dropped.
  type SelectionWithComposed = Selection & { getComposedRanges?: (...args: unknown[]) => StaticRange[] };
  const sel = selection as SelectionWithComposed | null;
  if (!text && sel && typeof sel.getComposedRanges === 'function') {
    const composed = sel.getComposedRanges(document);
    if (composed.length > 0 && !composed[0].collapsed) {
      try {
        const sr = composed[0];
        const liveRange = document.createRange();
        liveRange.setStart(sr.startContainer, sr.startOffset);
        liveRange.setEnd(sr.endContainer, sr.endOffset);
        text = liveRange.toString();
      } catch {
        // startContainer / endContainer live inside a shadow root that
        // document.createRange cannot span; leave text empty and rely on the
        // caller to use extractDocumentText() as a fallback.
      }
    }
  }

  return {
    text: clean(text),
    url: location.href,
    title: document.title
  };
}

export function extractDocumentText(): TextExtraction {
  const article = document.querySelector('article');
  const target = article || document.body;
  const parts: string[] = [target.innerText || ''];

  // Append text from shadow DOM subtrees so content rendered by extensions
  // such as Monica.im and Cline (which use shadow roots) is included.
  const shadowText = collectShadowText(target);
  if (shadowText) {
    parts.push(shadowText);
  }

  return {
    text: clean(parts.join('\n')),
    url: location.href,
    title: document.title
  };
}
