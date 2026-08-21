# SelectPilot AI Runtime Lane Matrix

This contract defines which local runtime may perform each class of work without changing output authority, privacy, or user control.

## Current truth

- Ollama is the only implemented and authoritative inference lane.
- Gemini Nano and WebGPU are candidates, not current product capabilities.
- Candidate lanes remain inactive until capability, privacy, benchmark, failure/recovery, and contract evidence passes on the real unpacked-extension path.
- An unavailable or unverified lane fails closed. There is no silent failover to another provider.

## Decision rule

1. Output entering Golden JSON uses Ollama.
2. Optional, replaceable, non-authoritative assistance may become eligible for Gemini Nano after its promotion gate passes.
3. Semantics-preserving acceleration may become eligible for WebGPU after its promotion gate passes.
4. Unproven availability means inactive.

## Lane matrix

| Operation | Ollama | Gemini Nano | WebGPU |
| --- | --- | --- | --- |
| Structured extraction | Required | Forbidden | Support only |
| Canonical normalization | Required | Forbidden | Support only |
| Preset execution | Required | Forbidden | Support only |
| Golden JSON summary | Required | Forbidden | Support only |
| Disposable preview | Available | Eligible after promotion | Support only |
| Rewrite suggestion | Available | Eligible after promotion | Support only |
| Intent or preset hint | Available | Eligible after promotion | Support only |
| Deterministic pre/post-processing | Available | Forbidden when canonical | Eligible after promotion |
| Runtime benchmarking | Measured on physical target | Measured only when enabled | Measured only when enabled |

“Support only” means acceleration without semantic authority. It cannot create, repair, replace, or silently alter canonical output.

## Hard boundaries

- No silent provider or model failover.
- No remote inference fallback.
- Gemini Nano cannot create, repair, or persist Golden JSON.
- WebGPU is acceleration, never semantic authority.
- Capability detection sends no selected text and creates no model session.
- Runtime identity, locality, selected profile, context window, failure, and fallback path remain observable.
- A declared model fallback must be installed, policy-allowed, non-quarantined, and surfaced as a fallback.
- Simulation evidence cannot promote a lane or model.

## Promotion gate

A candidate lane may ship only when all of the following are true:

- implemented end to end for its allowed operation set;
- privacy and strict no-external-network tests pass;
- success, failure, and recovery paths pass;
- repeatable benefit is measured on every supported hardware class;
- output equivalence is proven, or the output is structurally non-authoritative;
- UI truth identifies runtime, locality, and execution state without ambiguity;
- evidence is bound to an exact protected-main SHA;
- Linear acceptance and dependencies are reconciled.

Until every gate passes, the lane remains inactive and must not appear as an available product capability.

## Evidence classes

| Evidence | Proves | Does not prove |
| --- | --- | --- |
| Static traceability | Source-to-contract mapping | Runtime behavior |
| Deterministic simulation | Repeatable policy/scenario logic | Hardware performance or promotion eligibility |
| CI/E2E code admission | Exact code path passes automated checks | Physical local-model execution |
| Physical runtime evidence | Observed behavior on a named target and exact SHA | Other hardware classes |
| Full-system DoD | All protected delivery and runtime gates pass | Nothing beyond the declared release scope |

## Source authority

- This file owns the versioned runtime-lane contract.
- Linear owns planning, status, dependencies, acceptance, and evidence.
- The Linear architecture resource is [SelectPilot AI Runtime Lane Matrix](https://linear.app/sodersten-space/document/selectpilot-ai-runtime-lane-matrix-aecba24119c7).
- Conflicts fail closed until repository and Linear sources are reconciled.
