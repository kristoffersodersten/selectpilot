function clean(text) {
    return text.replace(/\s+/g, ' ').trim();
}
export function extractSelection() {
    const selection = window.getSelection();
    const text = selection ? selection.toString() : '';
    return {
        text: clean(text),
        url: location.href,
        title: document.title
    };
}
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
