// module_name: public_site_configuration
// spec_ref: "reporting"
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const required = ['PADDLE_CLIENT_TOKEN', 'PADDLE_PRICE_ESSENTIAL', 'PADDLE_PRICE_PLUS', 'PADDLE_PRICE_PRO', 'ENTITLEMENT_AUTHORITY_URL', 'CHROME_WEB_STORE_URL'];
for (const name of required) if (!process.env[name]?.trim()) throw new Error(`Missing ${name}`);
for (const name of ['PADDLE_PRICE_ESSENTIAL', 'PADDLE_PRICE_PLUS', 'PADDLE_PRICE_PRO']) {
  if (!/^pri_[A-Za-z0-9]+$/.test(process.env[name])) throw new Error(`${name} must be a Paddle price ID`);
}
for (const name of ['ENTITLEMENT_AUTHORITY_URL', 'CHROME_WEB_STORE_URL']) {
  const url = new URL(process.env[name]);
  if (url.protocol !== 'https:') throw new Error(`${name} must use HTTPS`);
}
const config = `window.SELECTPILOT_CONFIG = ${JSON.stringify({
  paddleEnvironment: process.env.PADDLE_ENVIRONMENT === 'sandbox' ? 'sandbox' : 'production',
  paddleClientToken: process.env.PADDLE_CLIENT_TOKEN,
  prices: { essential: process.env.PADDLE_PRICE_ESSENTIAL, plus: process.env.PADDLE_PRICE_PLUS, pro: process.env.PADDLE_PRICE_PRO },
  entitlementAuthorityUrl: process.env.ENTITLEMENT_AUTHORITY_URL,
})};\n`;
await mkdir('site-dist', { recursive: true });
for (const file of ['index.html', 'pricing.html', 'checkout.html', 'checkout.js', 'privacy.html', 'support.html', 'styles.css']) {
  const source = await readFile(path.join('site', file), 'utf8');
  await writeFile(path.join('site-dist', file), source.replaceAll('INSTALL_URL', process.env.CHROME_WEB_STORE_URL));
}
await writeFile('site-dist/config.js', config, { mode: 0o644 });
