function clean(text) {
    return text.replace(/\s+/g, ' ').trim();
}
function pageColor() {
    const body = getComputedStyle(document.body).backgroundColor;
    if (body && body !== 'rgba(0, 0, 0, 0)')
        return body;
    return getComputedStyle(document.documentElement).backgroundColor || 'rgb(255, 255, 255)';
}
// @spec_ref execution_layer
export function extractSelection() {
    const selection = window.getSelection();
    const text = selection ? selection.toString() : '';
    return {
        text: clean(text),
        url: location.href,
        title: document.title,
        pageColor: pageColor(),
    };
}
