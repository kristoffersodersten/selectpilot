# Chrome Web Store Release Checklist

Last updated: 2026-08-21

## Automated Gate

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm test:privacy`
- [ ] `pnpm build`
- [ ] `pnpm lint:manifest`
- [ ] `pnpm validate:store`
- [ ] `pnpm test:e2e`
- [ ] `pnpm package:store`
- [ ] Package SHA-256 and inventory are preserved with the release evidence.

`pnpm package:store` must fail if the pinned entitlement keyring is absent, invalid, or remote executable code enters the extension. Never bypass that gate with a development key or unsigned access.

Production packaging requires `SELECTPILOT_ENTITLEMENT_PUBLIC_KEYS_JSON` as a JSON key ring whose values are raw 32-byte Ed25519 public keys encoded as 64 hexadecimal characters. The matching issuer uses only:

- `SELECTPILOT_ENTITLEMENT_SIGNING_KEY_FILE`: an absolute path to private key material outside the repository;
- `SELECTPILOT_ENTITLEMENT_SIGNING_KEY_ID`: the exact rotation ID present in the public key ring.

Never place the private key, its contents, or a production signature fixture in Git, CI logs, Linear, test data, or the extension package. Signer provisioning and activation remain an authorized secrets operation.

The separately operated local billing authority installs its pinned runtime with `python3 -m pip install --requirement requirements-billing.txt`. Its wallet RPC is loopback-only, entitlement/order state is written with owner-only permissions, administrative revocation requires a configured secret of at least 32 characters, and generated order IDs contain 128 bits of random material.

## Product Truth

- [ ] The listing describes one purpose: selected text to structured local output.
- [ ] Ollama and the local bridge requirements are visible before installation.
- [ ] Trial, paid tiers, and feature boundaries match the exact production configuration.
- [ ] Experimental capabilities are excluded from the core claim.
- [ ] No Team or self-hosted availability is claimed.

## Privacy And Security

- [ ] Store disclosures match [`PRIVACY_POLICY.md`](./PRIVACY_POLICY.md).
- [ ] Core content traffic is limited to user-owned localhost services.
- [ ] Any non-content commerce traffic is disclosed separately.
- [ ] Production entitlements are signed and verified fail-closed.
- [ ] No secret, private key, token, log, report, source map, or test artifact exists in the ZIP.
- [ ] Optional retained data can be inspected, exported, and deleted.

## Assets

- [ ] Store icon is `128x128`.
- [ ] Three screenshots are `1280x800` and show actual product behavior.
- [ ] Small promo tile is `440x280`.
- [ ] Marquee tile is `1400x560`.
- [ ] Copy and visuals match the submitted extension version.

## Manual Runtime Acceptance

- [ ] Fresh Chrome profile installation succeeds.
- [ ] From the exact package in headed Chrome, select text and invoke both the toolbar action and configured shortcut.
- [ ] Each user gesture injects the content script on demand and the selected text appears in the panel.
- [ ] The extension cannot read the active tab URL before either user gesture.
- [ ] Missing Ollama produces one calm, actionable installation path.
- [ ] Consent-gated model provisioning succeeds on supported hardware.
- [ ] Installation prewarms the selected generation model before reporting Ready.
- [ ] Two identical warm requests produce identical canonical JSON with the fixed production seed.
- [ ] First selected-text extraction reaches a validated result.
- [ ] JSON, Markdown, and plain-text exports open correctly.
- [ ] Failure and recovery paths are verified without silent fallback.
- [ ] Uninstall and retained-data deletion behavior are verified.

## Dashboard Gates

- [ ] Homepage URL is public and verified.
- [ ] Support URL is public and verified.
- [ ] Privacy policy URL is public and verified.
- [ ] Listing, Privacy, Distribution, and Test Instructions fields are complete.
- [ ] Reviewer-only setup information contains no repository secret.
- [ ] Saved dashboard fields are reopened and checked for persistence.
- [ ] Submission and publication strategy are explicitly authorized.

## Completion

The release is complete only after the exact package is accepted, published, installable from the Store, and reverified through the real first-use path. A local ZIP or green CI run is not publication evidence.
