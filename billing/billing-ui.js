import { openCheckout } from './paddle-checkout.js';
import { getPricing } from '../background/tier-service.js';
import { button, setHTML } from '../utils/dom.js';
export async function mountBillingUI(root) {
    const pricing = await getPricing();
    const tiers = Object.entries(pricing.tiers);
    const rows = tiers
        .map(([tier, price]) => {
        const disabled = pricing.products?.[tier] ? '' : ' disabled';
        return `<div class="billing-row"><div>${tier}</div><div>$${price.toFixed(2)}</div><button data-tier="${tier}"${disabled}>Choose</button></div>`;
    })
        .join('');
    setHTML(root, `<div class="billing-grid">${rows}</div>`);
    root.querySelectorAll('button[data-tier]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const tier = btn.dataset.tier;
            const product = pricing.products?.[tier];
            if (!product)
                return;
            button(btn, true);
            openCheckout(product, undefined).finally(() => button(btn, false));
        });
    });
}
