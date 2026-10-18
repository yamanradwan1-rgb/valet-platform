# Issue #300 R2 — Microsecond keyset and S0 correctness follow-up

**Date:** 2026-10-18. **Scope:** Owner-approved local-only R2 integration. **Final acceptance:** **NOT READY**; this note adds source-level and disposable PostgreSQL precision evidence without replacing the original readiness report.

## Independently reported P1 and concrete failure modes

An independent read-only security reviewer found two concrete PostgreSQL `timestamptz` precision losses in Search/Timeline, previously hidden by millisecond-only source fixtures:

1. **Signed page key:** PostgreSQL sorts by microseconds, but `Date.toISOString()` discarded the last three fractional digits when encoding Search's descending `(last_at, Session UUID)` and Timeline's ascending `(occurred_at, source rank, event UUID)` cursor. This could skip a Search Session or replay a Timeline event within the same millisecond. A JS-millisecond ordering assertion could also reject a valid chronological Timeline.
2. **S0 cutoff:** `clock_timestamp()` was truncated on return from PostgreSQL into a JS `Date`, and subsequent `created_at <= S0` source/parent/Audit-integrity checks used the truncated value. A source committed at `.000500` before S0 `.000900` could be silently excluded while the response still reported available coverage.

## Targeted, fail-closed source corrections

- Capture `pg_current_snapshot()` and the original six-digit UTC `clock_timestamp()` from **one MATERIALIZED SQL row**; continue exposing only the existing millisecond `snapshotAt` field to API consumers.
- Thread the exact `snapshotCutoff` text through Search, four-source Timeline, generic Audit integrity, anchored Audit anomaly and the default/cohort U05 guard. PostgreSQL receives a bound `::timestamptz` parameter, never dynamic interpolation.
- Select independent exact-six-digit `lastMatchedAtCursor` and `occurredAtCursor` values from PostgreSQL for signed page boundaries. Timeline's server-side order assertion compares the canonical six-digit strings before rank/UUID. Existing public event/item timestamps remain millisecond ISO for backward compatibility.
- Preserve the existing signed scope/session/purpose/filter/database-snapshot checks. Cursor *private payload* now requires exact six fractional digits and an internally matching snapshot cutoff. Previously issued truncated signed v1 cursor payloads **fail closed**, requiring a fresh Apply; never reinterpret them against a different cutoff.
- Separate the generic F01 integrity query into `search/search-integrity.ts`, retaining its query semantics and exports while meeting the 300-physical-line architecture cap.
- Tighten the W7 **validation harness**, not production policy: authenticated default unsafe-cohort proof now requires exactly **HTTP 503** with `Cache-Control: no-store`. HTTP 401, 403 or 404 is **not** accepted as a substitute for a correctly authorized 503. The harness also requires the exact approved loopback Dashboard origin.
- Change the Playwright evidence harness to explicitly select **one unique case** via `ISSUE300_W7_SINGLE_FRESH_MFA_CASE`. Other tests are skipped before their browser contexts are constructed; an MFA bootstrap refresh cookie is **not** reused among 34 independent browser contexts. This does **not** certify safe state reuse across separate executions; the separately acquired one-time MFA state must be discarded after its only run.

## Actual isolated PostgreSQL 17.10 precision witness

Against the named task-owned PG17 `issue300_r2_pg17` / `issue300_r2`, using only `BEGIN READ ONLY` and `ROLLBACK`, parameterized-value demonstration with two different microsecond values in one millisecond returned:

| Witness | Six-digit key/cutoff | Prior truncated key/cutoff |
| --- | --- | --- |
| Search descending page-2 source count | **1** | **0** (omission) |
| Timeline ascending page-2 source count | **1** | **2** (replay) |
| Source `.000500` included at S0 `.000900` | **true** | **false** (omission) |

PostgreSQL round-tripped the precise UTC value `2026-10-18T12:00:00.000900Z`. This is **actual read-only PostgreSQL behavior** demonstrating the failure mode and SQL comparison semantics; it is **not** a signed HTTP S0/S1 held-writer acceptance certificate.

## Re-executed regression evidence

- API TypeScript typecheck **PASS**.
- Focused Issue300 API Vitest **92/92 PASS** over 14 files, including new microsecond capture/positive cursor/negative truncated-cursor tests and the guarded unsafe source.
- Contracts tests **8/8 PASS**; contracts build **PASS**.
- Dashboard TypeScript typecheck **PASS**; Audit and Investigation Vitest **257/257 PASS** over 20 files.
- Independent Timeline/acceptance Node oracle **28/28 PASS**, after updating the mock source rows to include exact PostgreSQL precision.
- Scoped ESLint **PASS**; root architecture check **PASS**, with only existing grandfathered unrelated overlength warnings. All currently modified/new authored paths are **at most 300 physical lines**.
- Browser Playwright source collection **34 cases listed, none executed** (no separate authenticated fixture/lease). Dashboard TypeScript and scoped browser-harness ESLint **PASS**.
- Human-driven CA and LM password/TOTP enrollment and logged protected Filters/Search/Timeline `SUCCESS` were separately established in this disposable environment **before this source correction**, and therefore **must not** be attributed to a newly built or runtime-attested microsecond-fix API.

## Remaining mandatory GAPs — no silent promotion

The current running default-safe API `:3165` has **not** been restarted/re-attested with this changed source and continues protecting the human tester's LM login. The narrowly certified proof-only `:3164` remains disabled. There is no approved transfer of the human's in-memory token/cookies into Playwright; its single static `storageState` reused in 34 new contexts risks triggering refresh-cookie replay revocation and is **not executed**.

Required for full T01–T70 / U05-R01–R09 acceptance: fresh exact-SHA and bundle attestation, genuine CA/LM authenticated bounded HTTP responses on the corrected build, **authenticated exact-cohort default 503** vs scoped proof API 200, independently attested 100+ canonical source writers, signed Search **and** Timeline second pages, two-connection held-writer S0→S1, foreign tenant/Location and grant/revocation negative tests, real browser/visual matrix with safe **per-test** MFA sessions and same-fixture frozen baselines, fresh 93→96 upgrade interruption/concurrent-runner cases, and 100k/1m mixed-source, 10-minute true-writer and independently reset cold p95 trials.

**Decision:** keep default-deny guard and existing MFA; do not push, merge, deploy, run against shared/production database, or close Issue #300. The precise key/cutoff implementation has source/SQL regression evidence, but complete local acceptance and release readiness remain **unproven**.
