# Issue #304 — Option 3 final acceptance gate (not sign-off)

**Decision as of W1 documentation checkpoint: PENDING / NO-GO for merge, deploy or final Owner acceptance.** This is a live gate checklist, not evidence that any pending test was executed by W1. It must be updated **only from recorded real test runs/reviews** and a single locked integration SHA. Nothing in this document authorizes production activity.

## Identity and evidence control

| Requirement | Value / current record | Gate |
| --- | --- | --- |
| Approved concept | Immutable Option 3 `design/issue304/option-3.html` with SHA-256 `31e655ee1dc83311ea473705661a32638d59a17bf13c4d50ee6a00fc0ec939f2`, directly reverified in design worktree | **PENDING** final paired runtime screenshot check |
| Design checkpoint | Owner states `14d91167` | **PENDING** final evidence provenance |
| Original main | `a3779327690debc1ec561760641502967603c5f2` | Reference only |
| Prime integration SHA | Owner requested `96a18226cd453af0bab9e80bfecd489ee2c69ffd`; integration HEAD advanced to `21d3a959...` during report authoring | **PENDING** Prime locks one final SHA and retests it |
| W1 freeze / implementation evidence | [ISSUE304_VISUAL_FREEZE_MANIFEST.md](ISSUE304_VISUAL_FREEZE_MANIFEST.md); [ISSUE304_OPTION3_IMPLEMENTATION_REPORT.md](ISSUE304_OPTION3_IMPLEMENTATION_REPORT.md) | Documentation present; not a PASS |
| Current release authority | No final verified approval/CI/PR result supplied to W1 | **PENDING** |

Do not compare Option3 screenshot at one HTML hash to Dashboard code at a different SHA without declaring the mismatch. W1 observed old design screenshot imagery that did not show six KPI cards present in the hash-approved HTML. The immutable **HTML** is authoritative; recapture both sides. Uncommitted W6 traces, screenshots and tests appeared during integration review but were not examined or adopted as acceptance results.

## Gate register — every unchecked item remains PENDING

| Owner | Independent acceptance criterion | Evidence needed for PASS | Status |
| --- | --- | --- | --- |
| Prime | Final frozen integration SHA and exact file inventory; no unapproved product route/shell changes | `git rev-parse HEAD`, clean worktree, reviewed diff vs `a3779327`, SHA list | **PENDING** |
| W2 + W3 | Server-side **per-family** `keyFilter`/`spotFilter` `all|busy|available|inactive` applied before keyset page limit; subsequent pages yield matching resources even when first 50/100 have no hits; no N+1/unbounded scans | SQL/PG regression >100 with match only on page 3; typed request/response and cursor assertions; no fake Available for UNKNOWN | **PENDING** |
| W2 + W3 | Filtering/Location switch resets cursors, previous fetch aborts, stale A→B→A/scope/identity response never paints; six KPI totals **unfiltered** and authoritative | Integrated UI/API filter/cursor tests, stale-success/error race, disabled/unauthorized, no client pagination dead-end | **PENDING** |
| W3 + Prime | Exact Location overview count semantics and vehicle identity; Key/Spot state integrity | Focused contracts+PG test results against reviewed code, counts not partial-page sums, plate → descriptor → unavailable, inactive/unknown fail closed | **PENDING** |
| W3 + Prime | Bounded real key custody and persisted KeySlot human label; migration/grants least privilege | Custody read auth/ordering/limit tests, create-label idempotency operation fingerprint, migration/staging grant verification and query audit | **PENDING** |
| W4 | Existing Add Key, Add Spot, Add Zone, Label/QR/print/download dialogs operate with **exact Option3 scoped modal geometry**; no global CSS divergence; focus and MFA preserved | Before/after real integrated modal screenshots + pixel/DOM measurements, source diff only W4-owned files, creation/label/QR/focus/auth tests | **PENDING** |
| W5 + W6 | Narrow **Header exception only** fixes overlapping Sign out/Location and does not hide or rename anything; original sidebar/nav untouched | Actual integrated screenshots + control rectangles at 320/390 EN/AR light/dark, 768/1440 unchanged, 200% zoom, contrast/keyboard proof | **PENDING** |
| W6 | Production **exact Option 3 visual freeze** at 320/390/768/1440 × EN/AR × light/dark, all page regions, family states and dialogs | 16 genuinely paired reference/implementation captures with immutable hash, measured DPR/zoom, normalized CSS/DOM/geometry and pixel-diff review; independent reviewer verdict | **PENDING** |
| W6 | Six simultaneous KPI values correct under Location A→B→A, no duplicate Operational Keys tab and no missing list/detail states | Deterministic synthetic fixture data, server-authoritative API calls, filter and cursor, both family states, selected detail, empty/loading/error, no sensitive capture | **PENDING** |
| W6 | Disabled role, Company Admin + Location Manager, sensitive create MFA, response revocation, no information leakage | Synthetic-account/fixture E2E, 403/401 behavior, stale response, cross-tenant/cross-Location negative paths | **PENDING** |
| W6 | Real QR GET, signed-in create, image download and print produce usable exact resource identity; label reprint allowed only under current permission | End-to-end authorized fixture + API assertions and screenshot/download/print artifacts; no bearer secret in QR, no misleading synthetic operation | **PENDING** |
| W6 | Keyboard, WCAG 2.2 targets, screen-reader landmarks, labelled controls, focus nonobscuration, AR/RTL bidi and actual **native** 200% zoom | Tab/Shift+Tab/Escape, focus trap/restore, name/role/contrast/24px target checks, native zoom measurements, manual a11y review | **PENDING** |
| W7 | Independent P0/P1 source/security/visual audit on **same locked SHA** | Read-only exact file+line findings or clear signed verdict, audit of auth, QR, key custody, rates/queries, UI-freeze exceptions and W6 images | **PENDING** |
| Prime | Focused tests, typecheck/lint/build, migration/preflight and safety checks on locked SHA | Copyable commands, exit codes, test totals, platform/environment, artifact paths; no skipped essential tests | **PENDING** |
| Prime / CI | CI jobs green on reviewed PR commit, code review approved; schema rollout compatible and rollback reviewed | CI run URL/SHA/results, PR reviewers, migration/grants staging proof and release checklist | **PENDING** |
| Owner | Explicit review of final Option3 pixels and remaining differences, approval for release | Owner acceptance with timestamp, exact SHA, approved exception(s) and evidence links | **PENDING** |

**Clarification on pre-existing evidence:** W3's isolated reported tests and W5's reported local **5/5** focused synthetic header checks are traceable at `docs/validation/ISSUE304_BACKEND_RESOURCE_CONTRACTS.md` and `ISSUE304_MOBILE_HEADER_FIX.md`. They **do not** make the corresponding *integrated* entries PASS. W9's 64 mockup-state parity likewise does not prove the live implementation. The integration's uncommitted W6 test artifacts and partially evolving W2/W3 pagination changes remain unverified until final run reports are available.

## Required visual parity review and tolerances

The freeze is [ISSUE304_VISUAL_FREEZE_MANIFEST.md](ISSUE304_VISUAL_FREEZE_MANIFEST.md). Each of 16 EN/AR × light/dark × 320/390/768/1440 cells needs matching browser, viewport, DPR, source hash, screenshot state and data-safe mask list. Independently test Key and Spot list/detail, six KPI cards, vehicle fallback, search/filter, empty/error, mobile Back, create/zone, QR modal and print. Native browser **200% zoom** is a separate mandatory comparison, not a 720px viewport proxy or CSS transform.

- **DOM/semantics:** correct one-page inspector structure, six always-present KPI containers, family switch, list/detail and accessible dialog(s); no duplicate Operational Keys tab. React-generated IDs and real values may vary, but semantic/visual structures may not disappear.
- **CSS/geometry:** same VAYLET tokens and approved Option3 font/spacing/panel semantics. Target <=1 CSS px alignment for stable regions in a controlled same-browser font environment, with explicit documentation for every larger deviation. Never mask the main content, whole dialogs or header to hide layout changes.
- **Pixel differences:** inspect overlay/diff images, with initial review band <=2 RGB levels per channel in <=0.5% of **unmasked** pixels; this is *not an automatic PASS*. Missing controls, altered panel arrangement, clipped targets, wrong logo/headers or incorrect statuses fail even at a small global diff ratio. Real data content may be precisely masked; approval of style/layout changes is separate Owner authority.
- **Only permitted layout exception:** narrow mobile topbar height becomes content-sized so every original control remains visible. Desktop 64px header/sidebar/nav/colors/typography remain frozen. No broad responsive restyling, hide/ellipsis of Sign out, dialog chrome redesign or uncontrolled pixel tolerances.

## Runtime, security and privacy release stops

Any of the following makes the gate **BLOCKED** until corrected and rerun: tenant/Location BOLA/IDOR, Company Admin sensitive-create MFA bypass, unauthorized Supervisor/Employee access, wrong-code or cross-Location QR label, fabricated availability/vehicle, double-assigned current KeySlot/ParkingSpot, late-response repaint, lost custody audit, failed key label idempotency, zone mismatch, cursor gaps trapping page-3 matches, unbounded per-row queries, broken focus/modals, lost Sign out/navigation, or material unapproved deviation from Option3. Logs and screenshots must exclude secrets, PII and authorization tokens. No test may exercise production customer/session actions to prove this UI.

## Release and rollback sign-off prerequisites

1. Lock one final integration SHA and rerun **all** relevant tests on that SHA; independently verify approved prototype bytes. Record review/CI artifacts; do not cherry-pick source after acceptance without rerunning impacted gates.
2. Validate additive Prisma KeySlot.label migration in authorized disposable/staging environment with existing migration audit and scoped runtime EXECUTE grants, before activating dependent API code. Show backward compatibility with null labels and old QR V1, current V2 QR and correct safe failure. Production schema/application change sequence remains a separate authorized release operation.
3. Secure Owner/independent W7 sign-off, CI green, PR approval, production change window and rollback readiness. No unauthorized push, main merge, manual SQL or deploy by W1.
4. If regression is found, stop promotion; revert app to previously reviewed build via actual supported rollback process. Do **not** blindly drop a forward migration, erase historical custody, delete persisted resource data or replay uncertain idempotent requests. Require DB operator approval for forward fixes/schema remediation.

## Final approvals (intentionally unfilled)

| Signer | Reviewed immutable design | Reviewed final code SHA | Screenshots and test artifacts | Decision |
| --- | --- | --- | --- | --- |
| W2/W3 functional source owner | PENDING | PENDING | PENDING | **PENDING** |
| W4 modal owner | PENDING | PENDING | PENDING | **PENDING** |
| W6 integrated browser QA | PENDING | PENDING | PENDING | **PENDING** |
| W7 independent audit | PENDING | PENDING | PENDING | **PENDING** |
| Prime / CI / PR | PENDING | PENDING | PENDING | **PENDING** |
| Product Owner | PENDING | PENDING | PENDING | **PENDING** |

**Final verdict: NOT ACCEPTED / PENDING.** A later reviewer must replace each PENDING with a path, exact reviewed SHA, timestamp, test measurements and explicit PASS/FAIL statement. No evidence, no PASS.
