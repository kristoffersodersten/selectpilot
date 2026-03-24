export function $(selector: string, root: Document | HTMLElement = document): HTMLElement | null {
  return root.querySelector(selector) as HTMLElement | null;
}

export function on<K extends keyof HTMLElementEventMap>(el: HTMLElement | Document, type: K, handler: (ev: HTMLElementEventMap[K]) => void): void {
  el.addEventListener(type, handler as EventListener);
}

export function setText(el: HTMLElement | null, text: string): void {
  if (el) el.textContent = text;
}

export function setHTML(el: HTMLElement | null, html: string): void {
  if (el) el.innerHTML = html;
}

export function button(el: HTMLElement | null, disabled: boolean): void {
  if (el instanceof HTMLButtonElement) {
    el.disabled = disabled;
  }
}
