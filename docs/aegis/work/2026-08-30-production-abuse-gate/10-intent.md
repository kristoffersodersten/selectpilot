# SelectPilot Production Abuse Gate

## TaskIntentDraft

- Requested outcome: close all material global-governance, security, reliability, abuse, failure, recovery, and negative-space gaps before Chrome Web Store identity verification and publication continue.
- Scope: the complete SelectPilot product and release path represented by PR #22, including extension, local bridge, entitlement authority, installer, site, CI, packaging, runtime policy, evidence, and deployment contracts.
- Non-goals: no self-approval, branch-protection bypass, fabricated production credentials, silent fallback, production publication, or destructive live-state mutation.
- Signed intent: `AXIOM-20260830-OXBH25` in `intent.json`.
- Stop states: `done`, `blocked`, `needs-verification`, or `scope-exceeded`; only full-system evidence may support `done`.

## BaselineReadSetHint

- `/Users/kristoffersodersten/.codex/constitution-policy.yaml`
- global and repository `AGENTS.md`
- `CONTEXT.md`
- `docs/aegis/plans/2026-08-18-selectpilot-full-system-completion.md`
- `docs/selectpilot-project-snapshot.json` (known stale; evidence only)
- Linear project `SelectPilot — Lokal modell & runtime-stack` and SOD-1071
- PR #22 exact state and current head
- signed Axiom NovaForge lifecycle policy

## BaselineUsageDraft

- Acknowledged: constitution, global/repository rules, parent plan, current PR state, current project context, signed lifecycle policy.
- Missing or drifted: installed NovaForge operator policy binding; project snapshot exact SHA/current state.
- Decision: fail closed on unsupported completion claims; continue read-only audit and signed-intent-authorized repository repair.

## ImpactStatementDraft

This work may change public release contracts, CI gates, failure handling, abuse resistance, installer/runtime behavior, and evidence generation. All heavy proof must execute on Hetzner or GitHub Actions; local work is limited to control, editing, signing, and bounded inspection.

## Execution Readiness View

- Intent lock: full-system production resilience before Store continuation.
- Scope fence: SelectPilot repository and its declared deployment/runtime contracts.
- Canonical owners: existing extension, bridge, entitlement, installer, site, policy, and CI modules; no parallel fallback engines.
- Compatibility boundary: published local bridge/extension and billing contracts remain explicit and fail closed.
- Test obligations: deterministic abuse/fault matrix, security/privacy, resource/concurrency, recovery/rollback, full regression, exact-head CI, and physical-runtime verification.
- Review gate: protected independent approval remains mandatory.
- Drift rule: any conflict among constitution, Linear, code, runtime, and evidence pauses the affected claim and repairs the authoritative owner.
