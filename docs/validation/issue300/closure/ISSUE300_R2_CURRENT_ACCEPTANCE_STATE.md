# Issue #300 R2 — Local acceptance state (2026-10-20)

**Verdict: NOT READY. Source tests are not a substitute for signed live acceptance.**

## Exact isolated checkout

- Candidate: `codex/issue300-r2-safe-integration`, SHA
  `07393000129593e35430f74ce85fd9b8c85cffa7` at this report's creation.
- Source canonical remains independently parked at
  `4bc644e942c84d5c39cf1a39b972b46935779f1a`.
- Integration worktree: `D:/kndoom/valet-platform/tmp/issue300-r2-safe-integration`.
- No push, main merge, PR, production deployment, Issue closure or human DB
  changes performed. All code and source-only verification are local.
- Subsequent source/doc commits change the exact SHA; **all actual signed
  lease/build/certificate proofs must bind the then-current clean SHA**.

## Source checks and genuine limited DB checks

- New issuer + existing Owner-build tests: 15/15 offline Node PASS.
- Versioned browser and V2 evidence tests: 39/39 offline Node PASS on the
  earlier clean integrated source, before the extra Owner issuer tests.
- U005 signed-build + gate + versioned manifest: 42/42 offline Vitest PASS;
  with test-only positive signed runtime model: 45/45 PASS.
- Search/Timeline/Security source tests: 80/80 Vitest PASS on integrated source.
- API TypeScript `pnpm --dir apps/api typecheck`: PASS after fixing the test
  fixture's `process.argv[1]` restoration type; correct local `@valet/contracts`
  dependency is required. An old W16 junction pointing to `main` yielded
  false TS2305 errors and must not be reused.
- Focused ESLint on new issuer, proof and custody modules: PASS.
- W13 HTTP proof runner previously counted only three sessions although it
  authenticates CA, LM, Supervisor and foreign Staff. Source fixed to require
  four present, well-formed and distinct real session IDs; new offline
  independent test 3/3 PASS. **W13 actual HTTP NOT RUN**.
- W13 now derives CA/LM/Supervisor and foreign expected scopes from the W10
  deterministic SHA+lease Org/Location fixture, not the first attested scope
  entry. The currently shared CA+LM held lanes MUST be Location B (LM's only
  authorized Location); Location A, foreign-scope drift and missing B fail
  closed. The OTHER_LOCATION negative is exactly W10 Location A; the signed
  `allowedScopes` permit only W10 main-org Locations A/B, NEVER the foreign
  negative tenant. All W13 scope/session offline regressions 6/6 PASS total.
- Synthetic Windows ACL policy/bitmask tests and an actual nonsecret ACL
  denial probe: 2/2 PASS after separating model masks from live filesystem
  permissions; the positive full-path ACL check is still **GAP** because
  the existing host ancestors grant other accounts write/delete rights.
  Never count a fail-closed negative as a valid Owner custody positive.
- Actual previously owned V2 PG17.10 container
  `issue300_r2_w7_acceptance_v2_pg17` verified by full Docker ID, task label,
  loopback `127.0.0.1:58387` and dedicated volume. Transaction READ ONLY:
  `_prisma_migrations` 96 total/96 finished/96 distinct; runtime role can
  SELECT audit events but cannot UPDATE audit events, SELECT migration ledger,
  or CREATE schema objects. Owned container restored to `exited` afterwards.

## Do not count as PASS / still required

1. Exact-current-SHA **genuine pinned Owner** signed pre-build W17 lease.
   Issuer is source-only and explicitly gated; ignored Owner private PEM does
   not exist inside this integration checkout. Never invent or duplicate the
   genuine key, substitute an ephemeral key, or call self-tests real evidence.
2. Fresh truly built Contracts + API under the signed exclusive lease,
   immutable Owner-signed receipt and API/Contracts/source SHA association.
3. Versioned V2 resource manifest, approved scoped source oracle and actual
   valid signed whole U005 attestation through the unmodified production pin.
4. Legitimate isolated CA/LM account provisioning, real MFA/TOTP product flow,
   Search and Timeline S0/S1 real HTTP, and ordinary nonproof HTTP 503.
5. Actual signed isolated Dashboard browser target and all 34 Playwright
   cases (currently **0/34 accepted**).
6. Independent populated V3 93→96 / fresh / concurrent / killed-migrator
   migration runtime, recovery and readbacks; source-only/mock tests do not
   establish database acceptance.
7. Real broad/busy-skew 100k and 1m data, 2W5R and 8W25R workload mixtures,
   two full ten-minute runs and 20 signed cold trials; no latency PASS claimed.
8. Independent P0/P1 release review and explicit evidence for all 79 Owner
   acceptance gates. An unmet gate remains GAP; this Issue is NOT closed.

## Host admission and handling

- CPU repeatedly 90–100%; RAM free fluctuated under 500–3000 MiB while
  `Discovery` and unrelated human processes used resources. Do not stop or
  modify those processes or bypass the signed heavy-resource lease.
- Human service ports PG57285, API3165, Dashboard3114 must remain untouched;
  exclusive candidate services are PG58387, API3167, ordinary API3168,
  Dashboard3117. V3 planned PG58427 requires its own Owner signed admission.
- Issuer DACL guard is fail-closed on Windows key, controlled folder and
  ancestor rights; Owner identity/custody still demands independent positive
  verification before touching the real PEM. The real ACL probe exercised
  only an untrusted synthetic folder; bitmask positives were model tests.
  The host's inherited permissive ancestor ACLs prevent a genuine Owner
  private-key positive at the current task path. No permissions on those
  user/system paths were changed to force acceptance.
- After secure Owner provisioning of the private issuer key **inside the
  approved isolated checkout**, rerun source checks, verify exact clean SHA,
  check CPU/RAM/disk and issue the short Owner lease using the audited issuer.
  Do not copy or disclose keys through Chat, Git or acceptance logs.

This document is an evidence-gap manifest, **not an acceptance certificate**.
