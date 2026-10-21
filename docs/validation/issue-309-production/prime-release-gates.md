# VAYLET #309 — production implementation / release gates

**Status:** Production implementation candidate in progress. No permission to release private photo bytes has been accepted. This document is not a permission decision, deployment order or implementation completion certificate.

## Frozen source / approved new visuals

- Baseline `origin/main`: `459e9c42dfff5b2aeb11ee9165a7d1a4338a7783` (confirmed against current main before creating the isolated worktree).
- Immutable approved design: `design/issue-309-photo-viewer-html` at `a6227f681f4948305c331b1372062fe34533b9aa`, HTML SHA-256 `0b1900896b46af9d1f11dd88f01643978629001cb1c956de5f1e7f5987cdbd74`.
- The approved HTML is a **visual/interaction reference only** for the **new** photo section and enlarged viewer; do not transplant the mock Dashboard shell, synthetic fixture data, compiled source CSS, or demo controls into the real app.
- Source React drawer, its Help/Close, all 12 Vehicles / conditional 14 Live historical facts, their order, styling, focus and background shell are unchanged. Only append a new shared photo section **after** `FactList` in existing `OperationsDrawer` and render the approved viewer when selected.
- Reusable original Chrome evidence: `docs/validation/issue-309-prototype/baseline/` in the approved design branch; evidence is pinned to the same main SHA.

## No second upload pipeline

Employee Check-In capture, multipart transport, `ConditionPhotoController`, `ConditionPhotoBackendService`, `S3PrivatePhotoStore`, evidence verification, `vehicle_photo_*` and upload-attempt persistence already exist. Their files and flow are explicitly outside the requested implementation change. Read only exact-session `CHECK_IN_CONDITION`, `VERIFIED`, selected-attempt, `AVAILABLE` evidence with a limit of 10, and reuse `PrivatePhotoStore.readExact` with immutable object versions.

## Separate security approval gate: deny by default

Existing Dashboard, Management Audit, Employee upload, Supervisor Shift and DB privileges **never** imply a new Management photo-byte VIEW privilege. `security-and-access-questions.md` in the design branch is a **Proposed** policy, not an Accepted DEC. Even with owner approval of the visual design and code execution, authenticated production byte-read responses must remain fail-closed until the exact photo-VIEW principal/location/MFA/history/session/revocation contract is explicitly accepted and independently tested.

| Product/security decision | Currently proposed; **not accepted** | Default while pending |
| --- | --- | --- |
| Authorized principals | Company Admin with current MFA and current exact active Organization/Location; Location Manager with explicit current Location grant; Supervisor only if separately authorized | **DENY all** viewer image bytes |
| Assurance and entitlement | Current live Staff session, account/role/membership, location lifecycle, Dashboard commercial entitlement and MFA | Recheck under relevant lock order for every protected request |
| Completed historical sessions | May be eligible under current active granted Location; never by Vehicle alone | **DENY** until policy confirmed |
| Manifest and individual bytes | Separate authenticated exact Location + ValetSession scope; opaque photo ID, verified timestamp; no S3 keys/bucket/version/hash in DTO | No public/signed URLs, `no-store` only |
| Revocation serialization | Reauthorize after external S3 read, exact current evidence and `AVAILABLE`, with documented shared/exclusive row/advisory lock protocol and transaction-isolation requirement | **No release** without verified post-read fencing; no long DB transaction across S3 I/O |
| Production provider and retention | Named private S3-compatible provider, immutable versions, IAM, backup/hold/restore and contract retention | **No rollout** until DEC-104 U-005 gates accepted |

## Required production acceptance (separate, cumulative)

1. The **actual React source** before/after comparison proves frozen geometry, DOM semantics, typography, accessibility names, colors and paint unmodified outside new photo insertion. A standalone-HTML pixel comparison is insufficient.
2. The **new React photo component** matches the exact approved HTML across Vehicles/Live, EN/AR, dark/light, 320/390/768/1440, all ten states, modal open/closed, keyboard and actual Chrome native 200%.
3. Read-only photo manifest and protected JPEG bytes come from real isolated persisted qualified evidence in PostgreSQL plus the current versioned private S3-compatible adapter; no mock-only positive claim.
4. Exact-session tenant/location/role isolation, lack of upload privilege inheritance, object version/size/digest, `AVAILABLE` transitions, revocation races and stale browser Blob cleanup are independently verified under realistic concurrency.
5. Existing #215 upload/qualification/evidence integrity regression suite and affected Dashboard/API typecheck, test, lint, build, architecture and Git scope checks pass.
6. Unresolved original drawer Close clipping at physical 320 + native 200% must be reported as an inherited condition; do not change the frozen shared drawer header under #309.
7. Security auditor provides explicit scoped GO/NO-GO; Owner authorizes any proposed VIEW access policy and, separately, deployment/release. No automatic merge, Issue closure, production IAM/grant or deployment.

## Evidence statement format

The final report must separately state: `HTML DESIGN APPROVED`, `FULL FEATURE CODE IMPLEMENTED`, `NEW PHOTO UI MATCH`, `EXISTING DASHBOARD UI-FROZEN`, `REAL PRIVATE IMAGE DELIVERY`, `SECURITY ACCEPTANCE`, `PRODUCTION ROLLOUT READY`, with exact tests, SHA and blockers rather than implied success.
