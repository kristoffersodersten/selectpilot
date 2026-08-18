function clean(text) {
    return text.replace(/\s+/g, ' ').trim();
}
// @spec_ref execution_layer
export function extractSelection() {
    const selection = window.getSelection();
    const text = selection ? selection.toString() : '';
    return {
        text: clean(text),
        url: location.href,
        title: document.title
    };
}
// @spec_ref execution_layer
export function extractDocumentText() {
    const article = document.querySelector('article');
    const target = article || document.body;
    const text = clean(target.innerText || '');
    return {
        text,
        url: location.href,
        title: document.title
    };
}
