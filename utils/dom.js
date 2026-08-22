// module_name: utils_dom_ts
// spec_ref: "frontend_state_contract"
// @spec_ref frontend_state_contract
export function $(selector, root = document) {
    return root.querySelector(selector);
}
// @spec_ref frontend_state_contract
export function on(el, type, handler) {
    el.addEventListener(type, handler);
}
// @spec_ref frontend_state_contract
export function setText(el, text) {
    if (el)
        el.textContent = text;
}
// @spec_ref frontend_state_contract
export function button(el, disabled) {
    if (el instanceof HTMLButtonElement) {
        el.disabled = disabled;
    }
}
