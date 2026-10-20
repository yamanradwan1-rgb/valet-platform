# Issue #300 — W7 G2 LIVE data-only integration review

**Inspected Prime SHA:** `cc5f4390b54cfda39fa1f7f3671caff875f48c05`
(Prime moved from assigned `225b1465` before the review).
**Mode:** read-only Prime source, no database/browser/HTTP. These findings are
static source risks, not an executed real-runtime verdict.

## Observed checks

| Area | Evidence | Observed |
| --- | --- | --- |
| W7 oracle + ledger | `node scripts/validation/issue300/run-static-qa.mjs` | PASS: 10 reference + 5 lease-guard tests; 70 criteria parse correctly |
| Strict frozen G0 | `verify-frozen-ui.mjs` | **FAIL as expected**: 5 changed protected TSX files due approved LIVE exception |
| Exception-scoped G0 | `verify-live-ui-exceptions.mjs` | 119/124 SHA256 unchanged, exact five source exceptions; no other protected changed |
| Layout CSS/Help/Shell | Read-only diff from `0d5d0482559e5576293e341ac7ac02c655267a60` | Zero modified CSS, Help, or Shell files |
| Disclosure | `audit-page.tsx:101-111` | LIVE DATA, current-label qualification, no old DEMO DATA claim |
| Auth/scope | `audit-page.tsx:38-81`, `investigation-live.tsx:64-136` | CA/LM and exact Location gate, generation key and AbortController present |
| Source IDs/times | `investigation-live-projection.ts:65-124` | Source-qualified UUID keys; authentic occurred/recorded ISO; Asia/Amman display |
| Incident/current facts | `investigation-workspace.tsx:155-159,205-215` | No hardcoded real OPEN/KEY_MISSING; unavailable type/status is explicit |
| Backend source fixes | `search-witness-sql.ts:47-51`, `timeline-source-query.ts:133-137` | Earlier Vehicle contradiction and inactive Incident direct source fixed |
| Actual DB/HTTP/browser/CI | No runtime used | GAP; disposable DB lease remains blocked |

Only the five listed exception files are exempt from hash equality. Each still
needs human review of the SOURCE diff, and the exemption is no permission to
change CSS/grid/Help/interaction geometry. The approved exception is narrower
than declaring the full 124-file hash baseline PASS.

## Prioritized source findings

**P1 / W5 — Canonical Key Slot and Employee selectors fail at ordinary scale.**
`investigation-live.tsx:114-130` loads only 20 options once with no
`text`/continuation; `:164-174` uses those incomplete results for every
Apply. `investigation-selector-resolution.ts:89-95` rejects every Key Slot
when `slots.hasMore=true` (even if the typed exact code is included); beyond
the first 20 no member UUID is selectable. Repro: authorized Location with 21
historically used slots and 21 staff participants; type any valid slot code
and click Apply. The resolver returns `incomplete` or `missing`, with no
`/sessions` request. Required fix: bounded scoped exact-prefix/refinement
queries with completeness proof and canonical IDs, keeping frozen form geometry.

**P2 / W6 — Window markers become permanently unavailable.**
`timeline-projection.ts:70-76` creates `NOT_SUPPLIED` if optional
`discoveryContext` is absent from W3 timeline; the published W3 first-page
response has no discoveryContext. `investigation-live-projection.ts:47-52`
returns `unavailable` for that case, despite the applied search window
and authentic occurredAt being available. Repro: a 14:00–15:00 search whose
timeline contains 13:50, 14:30, and 15:20. All non-matching events display
"Discovery window unavailable" instead of before/context/after. Resolve
position using the exact applied UTC window, without inventing events.

**P2 / W5 — Filter failure persists without retry.**
`investigation-live.tsx:114-136` fetches selectors on mount only and stores
`optionsError`; `investigation-search-panel.tsx:62-64` then blocks Apply
even when Key Slot and Employee are both empty. Repro: transient selector
503, followed by healthy search endpoint. User cannot retry/perform an
unfiltered search unless remount/reload; provide safe retry/invalidation.

**GAP / Prime-W6 — Auth refresh while timeline/detail pending.**
`timeline-api.ts:26-40,44-61` requests have AbortSignal and the core API
has identity/session fencing, but unlike `investigation-search-client.ts`,
no `onAuthReconciled` callback is passed to trigger immediate `revoke`.
Parent scope keyed remount may suffice; proof of a refresh/revocation race
on the connected G2 app is still required by T56/T70. No leak is claimed.

## T56–T70 G3 acceptance obligations

| Criterion | Independent planned witness | Current real acceptance |
| --- | --- | --- |
| T56 | Scoped auth/session/Location change during delayed search/timeline/detail; old rows/drawers vanish | GAP |
| T57 | Apply/Clear, load, empty, selector failure/retry and no double GET | GAP; static retry defect above |
| T58 | Keyboard tab order, Help above drawer, Escape and focus return | GAP |
| T59 | EN/AR, RTL/LTR, 320/390/768/1440, effective 200%, long names and bidi UUID | GAP |
| T60 | Native Audit Events same table/filter/Help/security and no hidden Events GET in Investigation | GAP |
| T61 | Auth/privacy regression relative to latest #275 on real HTTP | GAP |
| T62 | Scoped skewed broad search EXPLAIN/BUFFERS at 100k/1m records | GAP |
| T63 | 100-row timeline count/keyset and N+1 bounded execution | GAP |
| T64 | Five readers with operational writes; lock/writer latency/deadlock record | GAP |
| T65 | Owned fresh/upgrade PostgreSQL, runtime grants and U05 trigger | GAP |
| T66 | Reject selector/source/metadata injection and unknown params | GAP |
| T67 | Failure injection in one of four source arms; no false complete page | GAP |
| T68 | Match count over canonical distinct source IDs; source pairing labeled records | GAP |
| T69 | Strict time/filter/UUID/cursor bounds via authentic endpoints | GAP |
| T70 | Disconnect, then authenticated retry; no loop, stale rows or writes | GAP |

The new `issue300-real-source-identity.spec.ts` is intentionally opt-in
for a future Prime-owned actual-auth browser lease with known real-writer IDs.
It passively observes search/timeline/detail responses (no route mocks),
checks that the page no longer claims DEMO DATA, verifies source-qualified
event UUID, actual occurredAt and same Session identity, and ensures the
visible detail never shows the fixture IDs. It has **not been executed**.
It does not replace T56/T70 race, privilege, performance, or DB proof.
