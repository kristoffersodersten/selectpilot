import { openCheckout } from './paddle-checkout.js';
import { getPricing } from '../background/tier-service.js';
import { button, setHTML } from '../utils/dom.js';

export async function mountBillingUI(root: HTMLElement): Promise<void> {
  const pricing = await getPricing();
  const tiers = Object.entries(pricing.tiers);
  const rows = tiers
    .map(([tier, price]) => `<div class="billing-row"><div>${tier}</div><div>$${price.toFixed(2)}</div><button data-tier="${tier}">Choose</button></div>`)
    .join('');
  setHTML(root, `<div class="billing-grid">${rows}</div>`);
  root.querySelectorAll('button[data-tier]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tier = (btn as HTMLButtonElement).dataset.tier!;
      const product = pricing.products?.[tier];
      button(btn as HTMLButtonElement, true);
      openCheckout(product, undefined).finally(() => button(btn as HTMLButtonElement, false));
    });
  });
}
