(() => {
  const state = document.querySelector('#checkout-state');
  const config = window.SELECTPILOT_CONFIG;
  const tier = new URLSearchParams(location.search).get('tier');
  const priceId = config?.prices?.[tier];
  const claimStorageKey = `selectpilot_claim_${tier || 'unknown'}`;
  const claimId = localStorage.getItem(claimStorageKey) || crypto.randomUUID();
  localStorage.setItem(claimStorageKey, claimId);

  function message(title, detail, action = '') {
    state.innerHTML = `<div><h2>${title}</h2><p>${detail}</p>${action}</div>`;
  }

  async function redeem() {
    const response = await fetch(`${config.entitlementAuthorityUrl}/v1/claims/redeem`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ claim_id: claimId })
    });
    const result = await response.json();
    if (result.status === 'ready' && result.token) {
      const token = result.token;
      message('Your license is ready', 'Copy this key, then enter it in SelectPilot.', `<p><code id="license-key">${token}</code></p><button class="button" id="copy-license">Copy license key</button>`);
      document.querySelector('#copy-license').addEventListener('click', async () => {
        await navigator.clipboard.writeText(token);
        await fetch(`${config.entitlementAuthorityUrl}/v1/claims/ack`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ claim_id: claimId })
        });
        localStorage.removeItem(claimStorageKey);
        message('License copied', 'Return to SelectPilot and choose Activate.');
      });
      return;
    }
    message('Payment received', 'Your license is being prepared. This page will update automatically.');
    setTimeout(redeem, 1800);
  }

  if (!config || !priceId || !window.Paddle || !/^pri_/.test(priceId)) {
    message('Checkout is not available', 'Configuration is incomplete. No payment has been started.');
    return;
  }
  if (config.paddleEnvironment === 'sandbox') Paddle.Environment.set('sandbox');
  Paddle.Initialize({ token: config.paddleClientToken, eventCallback(event) {
    if (event.name === 'checkout.completed') redeem().catch(() => message('Payment received', 'Keep this page open while your license is prepared.'));
  }});
  Paddle.Checkout.open({ items: [{ priceId, quantity: 1 }], customData: { claim_id: claimId }, settings: { displayMode: 'inline', frameTarget: 'checkout-state', frameInitialHeight: 450, frameStyle: 'width:100%;border:0;background:transparent;' } });
})();
