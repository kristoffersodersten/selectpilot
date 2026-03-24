export type TextExtraction = {
  text: string;
  url: string;
  title: string;
};

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function extractSelection(): TextExtraction {
  const selection = window.getSelection();
  const text = selection ? selection.toString() : '';
  return {
    text: clean(text),
    url: location.href,
    title: document.title
  };
}

export function extractDocumentText(): TextExtraction {
  const article = document.querySelector('article');
  const target = article || document.body;
  const text = clean(target.innerText || '');
  return {
    text,
    url: location.href,
    title: document.title
  };
}
