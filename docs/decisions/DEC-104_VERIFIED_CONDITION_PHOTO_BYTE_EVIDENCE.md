# DEC-104 — Verified condition-photo byte evidence and Native QR-pattern capture

Status: **Accepted — architecture, scope, and bounded Native UI exception; implementation not yet verified**
Date: 2026-10-14
Owner: VAYLET product owner
Issue: [#215](https://github.com/yamanradwan1-rgb/valet-platform/issues/215)
Implementation plan: [Issue #215 master plan](../plans/ISSUE_215_VERIFIED_CONDITION_PHOTO_MASTER_PLAN.md)
Planning baseline: `923b5ce595fd2a2df9eadc6c7aa5041bd0bb7a93`

## Owner acceptance and authority

On 2026-10-14, the owner expressly accepted the recommended decisions **U-001 through U-007**, with their stated safeguards and provisional/production qualification boundaries, and approved **UI-X1 using the existing, ordinary Native QR camera flow as the visual and interaction reference**. This is approval of the product/architecture direction and this narrowly defined UI exception, not a claim that runtime code, schema, storage, Android proof, security review, production configuration, merge, deployment, or issue closure is complete.

This uniquely numbered DEC replaces neither the unrelated accepted **DEC-075 Staff Push Operational Policy** nor its history. The historical `glm/mob-011c-condition-photo-decision` photo `DEC-075` is a **Proposed** reference, not an accepted document. The current master plan remains the full conditional engineering specification. Where its original text says all U decisions and UI-X1 remain unapproved, this later owner acceptance supersedes **that approval status only**. Unverified technical assumptions and release gates remain open.

## Accepted U-001–U-007

| ID | Accepted direction | Non-negotiable qualification |
| --- | --- | --- |
| U-001 | Use **server-mediated**, authenticated upload of actual JPEG bytes and a private **S3-compatible, feature-owned** storage adapter. No generic media platform or client-trusted object key. | Reuse current Check-In/auth infrastructure; inspect and prove actual provider behavior. |
| U-002 | Separate durable upload **operations/attempts** from independently verified **photo evidence**; use server-generated identity, exact session/tenant/location/actor binding, append-only verification/audit and fenced idempotent retries. Maximum **10 qualified evidence photos per session** as the proposed MVP bound. | Accept exact schema/API/contracts from master plan subject to independent DB/security review; do not upgrade metadata-only legacy rows or trust a local URI. |
| U-003 | Adopt initial protective limits: **8 MiB JPEG**, **4096 px per side**, **12 megapixels total**, **5 s decode**, **60 s upload**, **15 s object operation**, **120 s lease**, **30 min operation**, **5 min sweep**, **100 items per sweep batch**. | These are **initial configuration/engineering bounds**, not benchmarked production SLOs. Measure device/server/provider behavior and adjust only by reviewed decision if necessary. |
| U-004 | Apply durable anti-abuse/resource bounds. Initial proposed limits: **20 uploads/user and 60/session per 15 min**, **120 status reads/user per 15 min**, **one pending operation per session/member**, **two live attempts per user**, bounded decoder concurrency. | Verify scoping, throughput, concurrent operators and false blocks under real peak use before rollout; reject unsafe saturation/fail-open behavior. |
| U-005 | Preserve **private evidence**, canonicalized/re-encoded JPEG with sensitive EXIF stripped, secure configuration, incident/evidence holds, orphan-only cleanup and auditable retention/backup handling. | **Specific S3 provider/bucket/credentials owner, contractual retention duration, legal/incident-hold process, scanning threat-model choice and production restore proof remain open operational gates.** Never auto-delete verified evidence merely to clear storage. |
| U-006 | Preserve existing Employee/Supervisor explicit Location-access and Check-In authority. Server derives Organization, Location, Membership, session and exact actor; no new Shift precondition or new intake-owner rule. Freshly authorized same-member session may reconcile a previous unknown upload outcome through explicit status/read flows. | Reauthorize at each protected boundary, including finalization; never silently replay a mutation or weaken existing cancellation/completion guards. |
| U-007 | Issue #215 ships the **Native required-photo** path and portable employee-client transport. Employee Web remains unchanged/fail-closed for required-photo until separately scoped. No general guest/public photo gallery or download endpoint in this feature. | Existing Optional Photos and unrelated Guest Access workflows remain unchanged. |

These selections adopt the complete recommended **C1** direction and associated safety constraints in the master plan. A coding agent may refine mechanically equivalent implementation details after source review; it must stop for owner approval before materially changing product semantics, security authority, limit policy, data-retention policy, evidence identity or the public API contract.

## UI-X1 — owner-approved QR-pattern visual exception (STRICT UI-FROZEN)

The owner selected **the same natural visual and interaction pattern as the application's existing QR camera flow** for condition-photo capture. This authorizes a **narrow new capture/review/status/retry path in Vehicle Condition**, not redesign of Check-In or reuse of a QR image as condition evidence.

Reference existing Native components and behavior before coding:

- `apps/valet-native/src/scanner/native-qr-panel.tsx` (camera opening/closing, permissions, modal reference);
- `apps/valet-native/src/parking/native-parking-qr-input.tsx` (in-flow camera, status/errors, existing action controls);
- `apps/valet-native/src/handoff/native-handoff-scanner.tsx` (camera launch, closing, Settings and lifecycle); and
- `apps/valet-native/src/check-in/native-check-in-condition-step.tsx` (frozen condition surface).

**Visual/behavioral approval boundary:**

1. Reuse the existing QR camera **look and feel**, button components, camera permission handling, native lifecycle, localization and accessibility conventions, as appropriate for a still-photo task. Opening/closing/back navigation must feel consistent with the existing QR scanner.
2. Add only a minimal, explicitly labeled photo action in the **existing condition/photo-policy area** and the required captured-photo review/retake/submit/status/retry affordances. Reuse current styles/tokens and action geometry instead of inventing a novel camera screen, layout or design language.
3. Preserve the existing header/logo, VehicleCard, three condition choices, unrelated controls, page layout and other flows. **Strict UI-FROZEN** remains binding outside the exact necessary photo interaction and any documented owner-approved delta.
4. A still-photo capture is **not barcode scanning**. Do not reuse QR/plate images as evidence or reuse QR state semantics that auto-accept candidates; capture must produce new bytes for independent authenticated upload and server verification.
5. Required-photo completion stays **fail-closed** until verified evidence is committed. Optional-photo behavior stays usable with zero photos. Pending/failed/unknown upload outcomes must be honestly reported through familiar existing controls; no concealed failure or pretend success.
6. Verify affected English/Arabic, RTL/LTR, Light/Dark, small/normal/large viewports, font scale, TalkBack/focus, permissions and interrupted/retry states. Compare unchanged elements against the same-configuration main baseline. Compare the *new* photo elements against captured existing QR-reference behavior and document the minimal exception delta.
7. If a necessary visible element **cannot** follow the QR reference without affecting frozen geometry or accessibility, STOP and request a narrow additional owner approval. This acceptance does not authorize an arbitrary bespoke redesign.

The QR-flow reference constitutes owner approval of **the visual pattern**, not blanket signoff of unseen final screenshots or device behavior. Implementation must still deliver reviewable EN/AR and Light/Dark evidence before acceptance. A separate novel HTML design is **not required** when the existing QR pattern is reused faithfully; a non-matching mockup would require explicit new approval.

## Binding technical invariants

- Photo byte receipt, validated private-object commit, authoritative verified evidence and condition completion are **distinct events**.
- Metadata registration, client-declared MIME/hash/key, local URI, QR image or plate OCR snapshot never counts as verified condition evidence.
- Only exact authorized Organization/Location/ValetSession/actor and current lifecycle/policy can qualify evidence. Legacy metadata-only rows remain non-qualifying.
- No long-running database transaction across external upload; use verified byte content, immutable attempt objects, durable operation journal and late-writer fencing with tested DB/storage unknown-outcome reconciliation.
- Protect IDOR, tenancy, employee session revocation, image bombs, upload limits, object privacy, audit history, preservation and cleanup races.
- Do not change the ordinary Check-In/Cancellation/Task/Key Custody state machine to make photo submission appear to work.

## Execution and approval boundaries

The master plan phases **P0 through P6** remain the execution order. This DEC resolves owner choice of C1 and UI-X1's **existing-QR visual pattern**, allowing the next agent to complete P0 documentation/baseline checks and to begin separately authorized implementation phases when their technical prerequisites are verified.

Before **production enablement**, identify and approve an actual private S3-compatible provider/bucket/credential owner, retention/hold/backup controls, scanner/decode threat-model stance, deployment/release owners and physical Android test devices. Tests must validate proposed caps and exact permission/transaction lock ordering; unresolved implementation findings must not be silently reclassified as owner-approved facts.

**Explicit exclusions:** no code, native screen, CSS/theme, migration, provider deployment, APK, production database, unrelated issue, PR/merge or issue closure is authorized merely by creating this DEC. Further code/merge/deployment actions require their normal assigned tasks, independent review, security/DB/physical evidence and the owner's release instructions.

## Consequences and references

- Preserve the full 36-section [implementation master plan](../plans/ISSUE_215_VERIFIED_CONDITION_PHOTO_MASTER_PLAN.md) as the engineering specification; record this decision as its owner-approval addendum.
- The issue remains **OPEN / BLOCKER** until real bytes, server verification, private storage, correct exact-session evidence, fail-closed policy, recovery, security, physical Android and UI-FROZEN gates pass.
- Follow the repository's mandatory docs, file-size and narrow-ownership constraints. No proposed feature code or release proof is claimed by this documentation decision.
