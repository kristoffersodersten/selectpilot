// module_name: content_extract-text_ts
// spec_ref: "execution_layer"
export type TextExtraction = {
  text: string;
  url: string;
  title: string;
  pageColor: string;
};

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function pageColor(): string {
  const body = getComputedStyle(document.body).backgroundColor;
  if (body && body !== 'rgba(0, 0, 0, 0)') return body;
  return getComputedStyle(document.documentElement).backgroundColor || 'rgb(255, 255, 255)';
}

// @spec_ref execution_layer
export function extractSelection(): TextExtraction {
  const selection = window.getSelection();
  const text = selection ? selection.toString() : '';
  return {
    text: clean(text),
    url: location.href,
    title: document.title,
    pageColor: pageColor(),
  };
}

// @spec_ref execution_layer
export function extractDocumentText(): TextExtraction {
  const article = document.querySelector('article');
  const target = article || document.body;
  const text = clean(target.innerText || '');
  return {
    text,
    url: location.href,
    title: document.title,
    pageColor: pageColor(),
  };
}
