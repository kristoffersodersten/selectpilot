// module_name: utils_dom_ts
// spec_ref: "frontend_state_contract"
// @spec_ref frontend_state_contract
export function $(selector: string, root: Document | HTMLElement = document): HTMLElement | null {
  return root.querySelector(selector) as HTMLElement | null;
}

// @spec_ref frontend_state_contract
export function on<K extends keyof HTMLElementEventMap>(el: HTMLElement | Document, type: K, handler: (ev: HTMLElementEventMap[K]) => void): void {
  el.addEventListener(type, handler as EventListener);
}

// @spec_ref frontend_state_contract
export function setText(el: HTMLElement | null, text: string): void {
  if (el) el.textContent = text;
}

// @spec_ref frontend_state_contract
export function setHTML(el: HTMLElement | null, html: string): void {
  if (el) el.innerHTML = html;
}

// @spec_ref frontend_state_contract
export function button(el: HTMLElement | null, disabled: boolean): void {
  if (el instanceof HTMLButtonElement) {
    el.disabled = disabled;
  }
}
