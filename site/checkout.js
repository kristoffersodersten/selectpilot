// module_name: public_checkout
// spec_ref: "validation_layer"
(() => {
  const state = document.querySelector('#checkout-state');
  const config = window.SELECTPILOT_CONFIG;
  const tier = new URLSearchParams(location.search).get('tier');
  const priceId = config?.prices?.[tier];
  const claimStorageKey = `selectpilot_claim_${tier || 'unknown'}`;
  const claimId = localStorage.getItem(claimStorageKey) || crypto.randomUUID();
  localStorage.setItem(claimStorageKey, claimId);
  const POLL_DEADLINE_MS = 5 * 60 * 1000;
  const REQUEST_TIMEOUT_MS = 10_000;
  const startedAt = Date.now();
  let pollAttempt = 0;

  function message(title, detail, action) {
    const container = document.createElement('div');
    const heading = document.createElement('h2');
    const paragraph = document.createElement('p');
    heading.textContent = title;
    paragraph.textContent = detail;
    container.append(heading, paragraph);
    if (action) container.append(action);
    state.replaceChildren(container);
  }

  async function post(path, body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${config.entitlementAuthorityUrl}${path}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
        cache: 'no-store', signal: controller.signal,
      });
      if (!response.ok) throw new Error(`authority_http_${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  function scheduleRedeem() {
    if (Date.now() - startedAt >= POLL_DEADLINE_MS) {
      message('License preparation needs attention', 'Reload this page to check again. Your payment has not been repeated.');
      return;
    }
    const delay = Math.min(15_000, 1_500 * (2 ** Math.min(pollAttempt, 4)));
    pollAttempt += 1;
    setTimeout(() => redeem().catch(scheduleRedeem), delay);
  }

  async function redeem() {
    const result = await post('/v1/claims/redeem', { claim_id: claimId });
    if (result.status === 'ready' && result.token) {
      const token = result.token;
      const action = document.createElement('div');
      const key = document.createElement('code');
      const button = document.createElement('button');
      key.textContent = token;
      button.className = 'button';
      button.type = 'button';
      button.textContent = 'Copy license key';
      action.append(key, button);
      message('Your license is ready', 'Copy this key, then enter it in SelectPilot.', action);
      button.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(token);
          await post('/v1/claims/ack', { claim_id: claimId });
          localStorage.removeItem(claimStorageKey);
          message('License copied', 'Return to SelectPilot and choose Activate.');
        } catch {
          message('License copied, acknowledgement pending', 'Keep this page open and try Copy license key again before closing it.', action);
        }
      });
      return;
    }
    message('Payment received', 'Your license is being prepared. This page will update automatically.');
    scheduleRedeem();
  }

  if (!config || !priceId || !window.Paddle || !/^pri_/.test(priceId)) {
    message('Checkout is not available', 'Configuration is incomplete. No payment has been started.');
    return;
  }
  if (config.paddleEnvironment === 'sandbox') Paddle.Environment.set('sandbox');
  Paddle.Initialize({ token: config.paddleClientToken, eventCallback(event) {
    if (event.name === 'checkout.completed') redeem().catch(scheduleRedeem);
  }});
  Paddle.Checkout.open({ items: [{ priceId, quantity: 1 }], customData: { claim_id: claimId }, settings: { displayMode: 'inline', frameTarget: 'checkout-state', frameInitialHeight: 450, frameStyle: 'width:100%;border:0;background:transparent;' } });
})();
