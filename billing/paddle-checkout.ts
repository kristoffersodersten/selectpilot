import { log, warn } from '../utils/logger.js';
import { getPricing } from '../background/tier-service.js';

const PADDLE_SCRIPT = 'https://cdn.paddle.com/paddle/paddle.js';

async function loadPaddle(): Promise<any> {
  if (typeof window === 'undefined') return null;
  if ((window as any).Paddle) return (window as any).Paddle;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PADDLE_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return (window as any).Paddle;
}

export async function openCheckout(productId: string, email?: string): Promise<void> {
  const Paddle = await loadPaddle();
  if (!Paddle) {
    warn('billing', 'Paddle not available');
    return;
  }
  try {
    const pricing = await getPricing();
    const vendor = pricing.vendor_id;
    Paddle.Setup({ vendor });
    Paddle.Checkout.open({ product: productId, email, frameTarget: 'paddle-checkout', displayModeTheme: 'light' });
    log('billing', 'opened checkout', productId);
  } catch (e) {
    warn('billing', 'checkout failed', e);
  }
}
