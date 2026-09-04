// module_name: production_deployment_contract
// spec_ref: "validation_layer"
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

test('entitlement authority uses a configurable conflict-free loopback port', async () => {
  const compose = await readFile('services/entitlement-authority/compose.yaml', 'utf8');
  const dockerfile = await readFile('services/entitlement-authority/Dockerfile', 'utf8');
  assert.match(compose, /127\.0\.0\.1:\$\{SELECTPILOT_AUTHORITY_HOST_PORT:-8091\}:8090/);
  assert.match(compose, /healthcheck:/);
  assert.doesNotMatch(compose, /127\.0\.0\.1:8090:8090/);
  assert.match(dockerfile, /ENTRYPOINT \["node"\]/);
  assert.doesNotMatch(dockerfile, /CMD \["node", "server\.mjs"\]/);
});

test('production proxy contract preserves TLS and loopback boundaries', async () => {
  const nginx = await readFile('services/entitlement-authority/nginx-tls.conf', 'utf8');
  assert.match(nginx, /server_name license\.selectpilot\.app/);
  assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:8091/);
  assert.match(nginx, /ssl_protocols TLSv1\.2 TLSv1\.3/);
  assert.doesNotMatch(nginx, /proxy_pass http:\/\/(?!127\.0\.0\.1)/);
});

test('Hetzner systemd authority preserves the security boundary', async () => {
  const unit = await readFile('services/entitlement-authority/selectpilot-entitlement.service', 'utf8');
  assert.match(unit, /DynamicUser=yes/);
  assert.match(unit, /NoNewPrivileges=yes/);
  assert.match(unit, /ProtectSystem=strict/);
  assert.match(unit, /IPAddressDeny=any/);
  assert.match(unit, /IPAddressAllow=localhost/);
  assert.match(unit, /LoadCredential=entitlement_private_key:/);
  assert.match(unit, /Environment=HOST=127\.0\.0\.1/);
  assert.match(unit, /Environment=PORT=8091/);
});

test('authority diagnostics never log request or credential content', async () => {
  const server = await readFile('services/entitlement-authority/server.mjs', 'utf8');
  assert.match(server, /entitlement_authority_request_failed/);
  assert.match(server, /method: req\.method/);
  assert.match(server, /path: req\.url/);
  assert.doesNotMatch(server, /body: rawBody|token: token|privateKey:/);
});

test('deployment preflight is executable and never prints secret contents', async () => {
  for (const scriptPath of ['scripts/preflight-entitlement-deployment.sh', 'scripts/install-entitlement-systemd.sh']) {
    const script = await readFile(scriptPath, 'utf8');
    const metadata = await stat(scriptPath);
    assert.ok(metadata.mode & 0o100);
    assert.match(script, /verify-entitlement-key\.mjs/);
    assert.doesNotMatch(script, /cat [^\n]*SECRET|set -x/);
  }
});
