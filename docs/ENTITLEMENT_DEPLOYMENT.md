# Entitlement Authority Deployment

The authority is the only component allowed to issue SelectPilot access. It stores token hashes, validates Paddle webhooks, and returns Ed25519-signed entitlement contracts. It never receives selected text or generated output.

## Required secrets

Create these files outside the repository with mode `0600`:

- Ed25519 PKCS#8 private key and its authorized public keyring, both provisioned outside the repository
- Paddle webhook endpoint secret
- Paddle price map JSON

The price map shape is:

```json
{
  "__trial__": { "tier": "pro", "features": ["extract", "export"] },
  "pri_...": { "tier": "plus", "features": ["extract", "export"] }
}
```

Copy `services/entitlement-authority/.env.example` to an external deployment `.env` and set the corresponding `*_FILE` variables. `SELECTPILOT_ENTITLEMENT_PUBLIC_KEYS_FILE` is the external public identity used to prove that the private signer matches the Store package; the checked-in extension keyring remains empty. The environment file contains paths, IDs, and ports only; credential values remain in the referenced mode-`0600` files. Create the state directory with mode `0700` and ownership matching `SELECTPILOT_UID`/`SELECTPILOT_GID`.

Run the fail-closed preflight before Compose:

```sh
sh scripts/preflight-entitlement-deployment.sh /absolute/path/to/selectpilot-authority.env
docker compose --env-file /absolute/path/to/selectpilot-authority.env \
  -f services/entitlement-authority/compose.yaml up -d --build
```

The default host binding is `127.0.0.1:8091`; the container still listens on `8090`. Override `SELECTPILOT_AUTHORITY_HOST_PORT` only after confirming the replacement loopback port is free. Never bind the authority directly to a public interface.

The production reverse proxy target is `http://127.0.0.1:8091`. Versioned Nginx bootstrap and TLS contracts are provided beside the Compose file. Install the HTTP bootstrap first, issue the certificate, then activate the TLS contract and run `nginx -t` before reload.

### Hetzner production service

The current Hetzner Snap-Docker daemon rejects executable startup whenever `no-new-privileges` is enabled. Disabling that control is not an accepted workaround. The production lane on this host is therefore the versioned native systemd service, which preserves `NoNewPrivileges`, loopback-only networking, read-only system paths, systemd credentials, an isolated dynamic user, and a private state directory.

Place the three mode-`0600` production credential files at the exact paths declared by `selectpilot-entitlement.service`, then run:

```sh
sudo sh scripts/install-entitlement-systemd.sh
```

The installer verifies the signing key against the pinned public identity, validates the hardened unit, starts it, and requires a successful loopback health request. It does not configure public DNS, TLS, Paddle, or Store publication.

## DNS and TLS

The authoritative DNS zone must contain these records before certificate issuance:

| Name | Type | Value |
| --- | --- | --- |
| `license` | `A` | `46.62.191.13` |
| `license` | `AAAA` | `2a01:4f9:3090:1eab::2` |

Verify both records resolve, then issue the certificate on Hetzner:

```sh
sudo install -d -m 0755 /var/www/letsencrypt
sudo certbot certonly --webroot -w /var/www/letsencrypt -d license.selectpilot.app
sudo nginx -t
```

Do not request a certificate before public DNS resolves to the declared host.

Required public routes:

- `POST /v1/paddle/webhook`
- `POST /v1/claims/redeem`
- `POST /v1/claims/ack`
- `POST /v1/entitlements/verify`
- `POST /v1/trials/start`
- `GET /health`

Configure Paddle to send webhooks to `https://license.selectpilot.app/v1/paddle/webhook`. Deployment is not production-ready until a real sandbox purchase, duplicate webhook, cancellation, claim redemption, signed verification, and key mismatch failure have all been observed through the public TLS endpoint.
