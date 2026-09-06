# Employee Native G1 Closure — 2026-09-06

This is a status/evidence record for the Employee Native execution program. It does not change product, domain, security, API, schema, or release policy. `docs/20_EMPLOYEE_NATIVE_EXECUTION_PLAN.md` remains the canonical sequencing and requirement source; this record reconciles the execution state reached after its earlier point-in-time status text.

## Current merged anchor

- Repository: `veletpro0-lgtm/valet-platform`
- Current merged `main`: `70695dbdbbd39ef8d996791b99776e4f84f7755f`
- Runtime used for owner physical checks: `corepack pnpm mobile:poc`
- Physical device evidence remains owner-attributed and distinct from CI.

## B0 / G1 evidence reconciliation

B0 contains MOB-010B, MOB-028, MOB-029, and MOB-015A. The G1 outcome is an authenticated, correctly scoped production shell with production queue and Shift-start behavior that recovers truthfully from revalidation rather than inventing local authority.

### MOB-010B / G0

- G0 baseline physical evidence is CLOSED from the earlier owner-attributed pass.
- Physical device: `V2302A`, Android 10, build `X690B-H691DE-Q-GL-220215V356`.
- Reviewed G0 SHA: `932dee4f6867ff609d0446e41ce0084e9a2215b8`.
- This evidence remains limited to the bounded G0 baseline and does not substitute for later signed release, complete Android matrix, soak, or pilot proof.

### MOB-028 — Production shell, access, and context routing

- Initial implementation: `29ae0a8a239751afdb3d4d6e00143b4348a8f14f`.
- Focused lifecycle/visual repair: `1cca7a4a40bb604dc0fcbe208bfd51feff42170d`.
- Independent GitHub review: PASS.
- Owner physical verification: PASS.
- Same-authority revalidation preserves valid in-progress workflow state; changed authority purges it.
- Historical remote CI evidence at this SHA remains not verified green and is not rewritten as a pass.

### MOB-029 — Production task queue and foreground attention

- Reviewed repair implementation: `4c2963e5afedbebfbe6bf747e783af4e6b586357`.
- Runtime-safety follow-up merged on top: `ec60b52305b58fbc754ca712ffc40e669561e2d7`.
- Independent code review: PASS.
- Owner physical verification: PASS for the functional MOB-029 scope.
- The production queue keeps the verified queue state through refresh/revalidation, fences stale results, preserves task-action recovery, and maintains same-authority attention ownership.
- Current foreground refresh cadence remains 5,000 ms as current product behavior, not an accepted SLO.
- GitHub issue #214, `Native Tasks queue visibly shifts during 5s foreground refresh`, remains OPEN as an explicitly non-blocking UX/performance follow-up. It must not be fixed by weakening authoritative refresh or stale-response protection.

### MOB-015A — Production Shift start and active-Shift presentation

- Implementation and merge commit: `70695dbdbbd39ef8d996791b99776e4f84f7755f`.
- Independent GitHub review: PASS.
- Owner physical verification on the correct MOB-015A build: PASS.
- Owner verified the user-facing Shift entry/active experience after restarting the correct Metro/runtime rather than the stale pre-MOB-015A bundle.
- Start Shift uses the existing Staff Shift authority and does not fabricate an active workspace from a client-local success state; authoritative operational context establishes the active scope.
- Active Shift presentation is intentionally bounded to the MOB-015A surface; Shift summary/end remains MOB-015B.

## G1 disposition

**G1 is CLOSED for the current execution sequence.**

The merged application path now contains the required B0 implementation and owner-attributed physical proof for the production shell, production task queue, and Shift start/active flow. This closes the dependency needed to begin B1.

Evidence levels remain separate. This closure does **not** claim that historical remote CI failures became green, does not mark the entire Native program production-ready, and does not waive later per-flow device, failure, load, signed-build, full-matrix, pilot, or release evidence.

Under the owner's current workflow decision, absence of feature-branch PR CI is not a blocker to continuing the application sequence; local validation must still never be described as CI.

## Exact next application-code slice

**MOB-011A — Vehicle identity, detail and intake continuation.**

The dependency path is now:

```text
G1 CLOSED -> MOB-011A -> MOB-011B -> MOB-012A -> MOB-012B -> G2
```

MOB-011A must retain the existing Web product as visual/product authority, reuse the accepted vehicle identity/detail commands and portable boundaries, preserve human confirmation and expected-version recovery, and avoid pulling condition completion, photo bytes, parking, DB/schema, or dependency work into the slice.
