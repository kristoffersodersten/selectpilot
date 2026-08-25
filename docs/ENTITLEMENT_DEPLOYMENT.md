# Entitlement Authority Deployment

The authority is the only component allowed to issue SelectPilot access. It stores token hashes, validates Paddle webhooks, and returns Ed25519-signed entitlement contracts. It never receives selected text or generated output.

## Required secrets

Create these files outside the repository with mode `0600`:

- Ed25519 PKCS#8 private key matching `pricing/entitlement-public-keys.json`
- Paddle webhook endpoint secret
- Paddle price map JSON

The price map shape is:

```json
{
  "__trial__": { "tier": "pro", "features": ["extract", "export"] },
  "pri_...": { "tier": "plus", "features": ["extract", "export"] }
}
```

Set the three corresponding `*_FILE` variables and `SELECTPILOT_STATE_DIR` in a local `.env`. Create the state directory with mode `0700` and ownership matching `SELECTPILOT_UID`/`SELECTPILOT_GID`, then run the Compose contract. Keep port `8090` bound to loopback and terminate public TLS in the existing reverse proxy at `license.selectpilot.app`.

Required public routes:

- `POST /v1/paddle/webhook`
- `POST /v1/claims/redeem`
- `POST /v1/claims/ack`
- `POST /v1/entitlements/verify`
- `POST /v1/trials/start`
- `GET /health`

Configure Paddle to send webhooks to `https://license.selectpilot.app/v1/paddle/webhook`. Deployment is not production-ready until a real sandbox purchase, duplicate webhook, cancellation, claim redemption, signed verification, and key mismatch failure have all been observed through the public TLS endpoint.
