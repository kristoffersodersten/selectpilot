# SelectPilot Full-System Completion Plan

## Aegis Visibility

This plan prevents slice-level test success, stale generated reports, or an open protected PR from being confused with product completion. The completion owner is the full path from installation and user intent through validated local output, export, protected delivery, and current evidence.

## Plan Basis

- User objective: finish SelectPilot to verified full-system Definition of Done without stopping at intermediate slices.
- Product authority: `README.md`, `ROADMAP.md`, `selectpilot_monolith_v3.json`, `ZERO_LEAKAGE.md`, `CONSTITUTION.json`, and active Linear project `SelectPilot — Lokal modell & runtime-stack`.
- Delivery authority: protected GitHub PR #22 and `main`; no self-approval or branch-protection bypass.
- Compute authority: `AGENTS.md` and `docs/compute-distribution.md`.
- Governance authority: signed Axiom lifecycle policy verified by NovaForge at the start of execution.

## Baseline Usage

- Required and read: repository contracts above, Linear project and all issues, PR #22 metadata/reviews, NovaForge operator manifest and Axiom lifecycle binding.
- Current delivery candidate: PR #22 head `bfab0eb3bff7fd4f1104cca93052e19ba73c3ab9`.
- Current protected base: `bc2f70bb71b51fbe1e94a4dbe74e427e27e35095`.
- Current contradictions:
  - `git diff --check origin/main...HEAD` fails on trailing whitespace/blank-line noise.
  - `pnpm test:e2e` does not start the local bridge and fails with `ECONNREFUSED 127.0.0.1:8083`.
  - the real unpacked-extension test skips without `SELECTPILOT_CHROME_EXECUTABLE`.
  - `reports/verification_report.json` records incomplete verification and `reports/spec_coverage_report.json` records missing/unmapped spec coverage.
  - `ROADMAP.md` still lists release-critical onboarding, privacy, E2E, and installation work.
  - Linear SOD-617 is correctly externally blocked, while the project-level status update is stale.

## Requirement Ready Check

- Goals and scope: explicit from the user and repository/Linear authorities.
- Acceptance: full end-to-end execution, deterministic contract enforcement, no implicit fallback, state integrity, failure/recovery verification, protected `main`, exact merge SHA, CI/E2E/security evidence, and reconciled Linear status.
- Open material authority: independent approval for protected merge remains external; it does not block implementation and verification work.
- Decision: ready.

## TDD Route

- Mode: off
- Decision: skipped
- Strict authority: not applicable
- Test posture: diagnostic reproduction plus post-change regression
- Reason: no explicit strict TDD request; existing contract tests and end-to-end gates are the primary evidence surfaces.
- Verification: targeted tests after each repair and the complete remote gate before delivery claims.

## Scope Fence

In scope:

- reconcile current product behavior with repository, Linear, privacy, runtime, and release contracts;
- repair deterministic test/runtime infrastructure;
- complete qualified P0/P1 and product-DoD verticals;
- qualify or explicitly defer roadmap-only model experiments using evidence and dependencies;
- refresh generated evidence so it describes current code truthfully;
- deliver through protected GitHub and update Linear.

Out of scope without separate authority:

- production Chrome Web Store activation or paid external publication;
- branch-protection bypass, self-approval, alternate identity, or secret generation;
- cloud inference or telemetry;
- silent local heavy-compute fallback.

## Compatibility Boundary

- Preserve the selected-text workflow and existing canonical `/extract` contract.
- Preserve local-only core execution and explicit paid entitlement boundary.
- Preserve deterministic profile/manual override semantics.
- Keep generated JavaScript synchronized from TypeScript; no divergent duplicate behavior.
- Keep documented direct Python entrypoint `python3 server/nano_server.py` working.

## Change Necessity

- User-visible need: a genuinely installable, usable, privacy-preserving SelectPilot with reproducible proof.
- Non-code option: documentation-only changes cannot start the bridge, eliminate skipped extension proof, or close runtime/spec gaps.
- Minimum boundary: canonical test configuration and runtime owners first; expand only when a verified product requirement remains unmet.
- Decision: code-change.

## Architecture Integrity Lens

- Canonical owners: TypeScript sources for extension behavior, Python bridge for local runtime, Playwright config for E2E lifecycle, spec/report compiler for generated evidence.
- No caller-side fallback may mask missing runtime, model, entitlement, validation, or privacy state.
- Stale reports must be regenerated or retired; they may not remain as false evidence.
- Verdict: repair canonical owners and remove/retire contradictory evidence paths.

## Execution Readiness View

- Intent Lock: full-system product completion, not slice completion.
- Scope Fence: product/runtime/release contracts above; no production publication or governance bypass.
- Baseline Lock: PR #22 head plus recorded fresh failures.
- Owner constraints: existing canonical owners; no duplicate runtime or demo engine.
- Test obligations: targeted regression, full remote lint/typecheck/build/unit/E2E/privacy/security, real unpacked-extension path, negative and recovery paths.
- Review gates: independent GitHub approval and protected merge.
- Drift rule: if code, Linear, and product authority conflict, stop the affected edit and reconcile authority before continuing.
- Completion evidence: exact merged SHA on `main`, current CI, runtime/E2E/security proof, current generated reports, Linear evidence, and requirement-by-requirement DoD audit.

## Task Batches

### 1. Restore deterministic baseline proof

- Add a Playwright-owned local bridge lifecycle with model auto-pull disabled and isolated run/log directories.
- Make unpacked-extension proof resolve a supported Chromium executable deterministically and fail explicitly instead of skipping in required proof mode.
- Remove whitespace noise and verify the documented direct Python entrypoint.
- Run remote lint, manifest lint, typecheck, build, unit/server tests, E2E, privacy tests, and `git diff --check`.

### 2. Reconcile product and generated truth

- Run the spec compiler, runtime-policy validator, UI-contract validator, stress harness, and report checks against the current candidate.
- Classify every missing spec node and unmapped artifact as implementation drift, obsolete mapping, or explicit roadmap/defer decision.
- Update canonical mappings/implementation or retire obsolete generated evidence; do not edit reports by hand to manufacture green status.

### 3. Complete release-critical user verticals

- Verify one-command bootstrap including Ollama detection, model provisioning, launchd/server health, explicit failure, and final summary.
- Verify real selected-text → side panel → local request → validated result → export flow.
- Enforce full-extension no-external-network regression.
- Reconcile first-run, copy, status terminology, controls, and accessibility with MUE and product truth.

### 4. Complete qualified runtime/model verticals

- Re-evaluate SOD-395, SOD-396, and SOD-394 against current code and actual supported Ollama models.
- Implement explicit per-profile `num_ctx` and JSON-schema constrained structured output where not already complete.
- Change default model only with current availability/license/runtime evidence and hardware-envelope proof; otherwise correct the Linear/project contract instead of shipping a false default.
- Keep SOD-397–SOD-401 roadmap-only unless their stated activation conditions are proven.

### 5. Close security, privacy, reliability, and release gaps

- Run dependency/security audits and secret scans on the exact candidate.
- Verify failure/retry, entitlement, encrypted persistence, direct entrypoint, no implicit model fallback, and no raw-selection/prompt leakage.
- Reconcile store assets, privacy policy, support/homepage requirements, packaging, and release checklist without claiming external publication.
- Perform gap, blind-spot, and negative-space analysis; close or explicitly block every material finding.

### 6. Governed delivery and final audit

- Push coherent verified commits to PR #22's branch so auto-merge remains active.
- Preserve SOD-617 as `In Review` + `Externally Blocked` until independent approval and protected merge occur.
- After approval, verify auto-merge, exact merge SHA/ancestry on `main`, full CI/E2E/security evidence, and post-merge runtime smoke.
- Update SOD-617 and project-level Linear status/evidence consistently.
- Mark the product complete only after every plan requirement has current authoritative proof.

## Risks and Retirement

- Risk: the monolith spec contains stale path mappings. Retirement requires compiler-backed replacement mappings and removal of contradictory generated reports.
- Risk: Linux Chromium proof may differ from macOS installation/runtime proof. Final evidence must include both remote automated proof and a bounded Mac control-surface smoke where platform-specific behavior is required.
- Risk: PR #22 independent approval remains external. Implementation continues; delivery status remains blocked until the protected merge is verified.
- Compatibility helpers or temporary test paths must include an explicit retirement trigger and may not become silent fallback behavior.
