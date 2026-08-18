// module_name: content_extract-text_ts
// spec_ref: "execution_layer"
export type TextExtraction = {
  text: string;
  url: string;
  title: string;
};

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// @spec_ref execution_layer
export function extractSelection(): TextExtraction {
  const selection = window.getSelection();
  const text = selection ? selection.toString() : '';
  return {
    text: clean(text),
    url: location.href,
    title: document.title
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
    title: document.title
  };
}
