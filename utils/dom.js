export function $(selector, root = document) {
    return root.querySelector(selector);
}
export function on(el, type, handler) {
    el.addEventListener(type, handler);
}
export function setText(el, text) {
    if (el)
        el.textContent = text;
}
export function setHTML(el, html) {
    if (el)
        el.innerHTML = html;
}
export function button(el, disabled) {
    if (el instanceof HTMLButtonElement) {
        el.disabled = disabled;
    }
}
