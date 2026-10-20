# Issue #304 — Option 3 implementation report (evidence ledger, not release approval)

**Status: PENDING — NOT accepted, merged to main, migrated or deployed.** This report describes source observed in Prime's isolated integration worktree at the requested checkpoint. It does **not** establish final runtime, security, pixel or production acceptance.

| Anchor | Verified / declared reference |
| --- | --- |
| Owner-selected design | `design/issue304/option-3.html`, **SHA-256 `31e655ee1dc83311ea473705661a32638d59a17bf13c4d50ee6a00fc0ec939f2`**, rechecked against immutable `D:/kndoom/valet-platform/tmp/issue304-design-prime/design/issue304/option-3.html` |
| Design checkpoint | `14d91167` (Owner-supplied reference; not independently verified as a commit in this review) |
| Original main baseline | `a3779327690debc1ec561760641502967603c5f2` |
| Prime integration checkpoint | `D:/kndoom/valet-platform/tmp/issue304-option3-integration` at `96a18226cd453af0bab9e80bfecd489ee2c69ffd` |
| Worktree movement | While documenting, integration HEAD advanced to `21d3a959fec0be8bfe098ec81db810f291c91179` with later pagination changes. This document's pinned acceptance target remains `96a18226` until Prime explicitly establishes a **new, frozen review SHA**. Never mix test results from different HEADs. |
| W1-owned visual contract | `docs/validation/ISSUE304_VISUAL_FREEZE_MANIFEST.md`; its prior commit `385e30f611c8ce52502c04b197edd39dbe053d03` was incorporated through integration `959a101f` |

## Source inventory — committed difference vs original main at checkpoint `96a18226`

The following paths were confirmed with `git diff --name-status a3779327 96a18226` in the Prime integration worktree. *Presence means implemented source exists, not that QA passed.*

| Responsibility | Files observed |
| --- | --- |
| Keys & Spots entry/composition | `apps/dashboard/src/features/operations/keys/keys-page.tsx` (replaces page-level Operational Keys/Physical Resources tabs); `option3-resource-inspector.{tsx,css}` |
| Inspector decomposition | `resource-inspector-{live,contract,copy,custody,detail,key-create,kpis,master,presentation}` under the same `features/operations/keys/` directory (TS/TSX by filename). The live adapter connects selected exact Location and authoritative API reads; the displayed six cards, family switch and master/detail are separately composed. |
| Existing action bridge and forms | `apps/dashboard/src/features/administration/physical-resources/issue304-action-{dialogs,intent}.{tsx,ts}`, `issue304-create-key-slot.ts`; focused adjacent `*.test.*` files. Existing physical-resource create/zone/label flows are reused, not deleted; **modal visual parity with Option 3 is PENDING W4/W6**. |
| API read and custody | `apps/api/src/modules/dashboard/physical-resource-{overview-query,custody-query}.ts`; changes to `physical-resource-{command,policy,query,read.service,controller}.ts`. |
| Shared read contracts | `packages/contracts/src/physical-resource-overview.ts` and test; `physical-resource-configuration.ts`, contracts barrel export. |
| Key-slot optional label persistence | `packages/database/prisma/migrations/20261020009700_issue304_key_slot_label/migration.sql`, `packages/database/prisma/schema.prisma`, `packages/database/scripts/physical-resource-runtime-privileges.mjs`, `docs/03_DATABASE_SCHEMA.md`. |
| Narrow shell exception | `apps/dashboard/src/styles/shell.css` and `apps/dashboard/e2e/issue304-header-geometry.spec.ts` only for Owner-authorized mobile overflow correction. |
| Focused tests | `apps/api/test/physical-resource-{overview, key-label-idempotency}*.test.ts`, `packages/contracts/src/physical-resource-overview.test.ts`, Dashboard `apps/dashboard/tests/issue304-{accessibility,authority,interactions,kpi,visual}.spec.ts`, supporting `issue304-{contract,fixture,parity,playwright.config}.ts`. |
| Relevant in-branch evidence | `docs/validation/ISSUE304_BACKEND_RESOURCE_CONTRACTS.md`, `ISSUE304_MOBILE_HEADER_FIX.md`, `ISSUE304_VISUAL_FREEZE_MANIFEST.md`, `issue304-w5/*`, `issue304-w6/TEST_PLAN.md`. Immutable HTML and old synthetic design screenshots are retained under `design/issue304/`. |

The original source diff also contains `.gitattributes` and historic design snapshot/evidence files; those **do not** constitute new product runtime behavior. The worktree contained **uncommitted** W6 Playwright source edits, `apps/dashboard/next-env.d.ts` and locally generated `issue304-w6/` browser artifacts during W1 inspection. They are not part of pinned `96a18226` and cannot be counted as passing or reviewed committed QA. The inventory must be refreshed on Prime's final SHA.

## Behaviors present in source, with pending verification

- **Exact Option 3 workspace:** `KeysPage` mounts `ResourceInspectorLive`, dropping duplicate top-level tabs. Six top summary cells in order: Key Slots **active / available / in use**, Parking Spots **active / available / occupied**; configured totals can appear in their captions. Original visual grouping, current vehicle and custody/zone distinctions must be tested against verified Option 3 screenshot pairs. User-facing status and operational usage are distinct. Empty/unknown must never be labelled free.
- **Authoritative bounded API:** documented GET `/v1/staff/dashboard/locations/:locationId/physical-resources/overview` yields two cursor-paged families and Location-wide counts; `/key-slots/:resourceId/custody` returns bounded real append-only history. Counts must remain independent of paging and filters. Read path must reject cross-tenant/Location access, avoid N+1 and stale A→B→A repaint. `docs/validation/ISSUE304_BACKEND_RESOURCE_CONTRACTS.md` is the existing W3 provenance for these design claims, not an end-to-end production attestation.
- **Pagination critical gate:** 0 matching rows on first/second pages must not strand a matching resource on page 3. The final accepted implementation needs authoritative server-side `keyFilter`/`spotFilter` (`all|busy|available|inactive`) before keyset `LIMIT`, returned matching cursors, unchanged six total counts, UI filter/cursor reset and request abort. This was **not verified at checkpoint `96a18226`**; later integration commit `21d3a959` modifies client paging but requires W2/W3 tests and final-QA proof. Never mark PASS merely because code exists.
- **Create and label authority:** Company Admin requires the appropriate sensitive MFA for create; exact Location Manager uses existing authorized Location scope. Supervisor/Employee remain denied. Existing idempotency must cover optional Key Slot human label in the request fingerprint; identical operation retry returns the original result, conflicting fingerprint rejects. Fresh authoritative QR V2 resource identity, no-secret static label, print/download and existing V1 compatibility remain required. **W4 modal parity and integrated auth/QR browser checks PENDING**.
- **Persistence:** new nullable Key Slot label, 1–160 chars with trim, migration-owned constrained creation routine and narrowly scoped runtime EXECUTE grants are documented at `ISSUE304_BACKEND_RESOURCE_CONTRACTS.md`. No deletion, data rewrite, state-machine change or custody replacement is authorized. **No proof here of running this migration in a production database; no such action performed by W1.**
- **Header:** `ISSUE304_MOBILE_HEADER_FIX.md` records a source-scoped correction to the inherited 64px mobile topbar spill: under `@media(max-width:820px)`, height becomes auto and flex basis auto while `min-height:4rem` remains. W5's isolated synthetic Edge/Next tests reported 5/5 focused tests with source measurements (320px about 134.19px, 390px about 92.19px, desktop unchanged). **Full W6 integrated route, real native 200% zoom, both languages/themes and independent visual parity remain PENDING**; CSS source presence is not integrated PASS.

## Evidence provenance — keep claims separated

| Evidence item | Provenance | Safe statement here | Release gate |
| --- | --- | --- | --- |
| Immutable HTML SHA | Direct PowerShell `Get-FileHash` re-check in design worktree | **VERIFIED** exact reference byte hash | Still compare paired rendered implementation |
| W3 resource overview / label tests | W3 authored `ISSUE304_BACKEND_RESOURCE_CONTRACTS.md:29-33` | W3 **reported** focused unit/PG and contracts tests; Prime earlier **reported** 3/3 contract and 3/3 API query tests | **PENDING** final integrated tests/migration smoke and CI |
| W5 mobile header | `ISSUE304_MOBILE_HEADER_FIX.md`, `issue304-w5/header-geometry-results.json`, synthetic local captures | W5 **reported** 5/5 focused synthetic-header tests at reviewed isolated revision | **PENDING** final integrated W6 native-zoom/browser run |
| W2 implementation / cursor filters | Commits through `96a18226` and subsequent `21d3a959` | Source exists and is changing | **PENDING** W2/W3 page-3 matching filter regression |
| W4 dialogs / action flow | `issue304-action-dialogs.tsx`, native create/label/zone dialogs | Reuse shown in source; no independent final modal geometry comparison provided to W1 | **PENDING** W4 final scoped parity and W6 |
| W6 browser artifacts | `issue304-w6/TEST_PLAN.md`, local uncommitted browser traces/screenshots observed | Files existed **while** QA was running; not evaluated by W1, not a PASS | **PENDING** final committed report with actual counts, screenshots and failures |
| W7 independent read-only audit | No final verdict furnished to W1 at this checkpoint | No assertion | **PENDING** exact diff/security/visual P0/P1 clearance |
| CI, PR and release | No completed CI/PR or deployment evidence furnished | No assertion | **PENDING** review, merge/deployment authorization |

## Security, QR and confidentiality acceptance

The final reviewers must show server-enforced Organization/Location/role isolation; current status/assurance/MFA per action; persisted true vehicle fallback plate → descriptor → unavailable; no UUID as vehicle heading; no client-derived availability from ACTIVE; no reuse of prior scope data after revocation or logout; bounded response shape, cursor filtering and no N+1; append-only real custody. They must also prove QR read is authorized at the point of use, actual V2 payload/UUID+code+type matches persisted resource, print excludes app chrome, downloaded image is generated from the authorized label, and neither QR nor logs/traces include secrets or sensitive customer/session data. A snapshot of an open dialog does not prove these properties.

## Rollout, abort and rollback boundary

**No automatic deploy or merge.** Before attempting any rollout: lock the final SHA; verify reviewed schema/migration with existing production migration workflow, validate additive DB security-definer routine and least-privilege runtime grants, run full contracts/API/Dashboard integration suite, W6 visuals, W7 security audit, CI and PR review. Backup/checkpoint DB under existing policy. Apply the **forward-only additive** Key Slot label migration and grants before enabling an API that relies on the new field. Test read/write with authorized QA identity against migrated staging DB before production change window.

If a P0/P1, mismatched Option 3 visual, faulty ACL, or migration/privilege error occurs, **stop promotion and revert application traffic/build to the last known-good reviewed release using normal release process**. Do not drop the newly additive `key_slots.label` column, rewrite historical KeyCustodyEvents, delete resource records, roll back a production Prisma migration by editing old migration files, or force-replay uncertain POSTs. Preserve state, audit incident, disable new integration only through a *confirmed existing* deployment switch/rollback mechanism (no assumed feature flag), and prepare a forward-fix migration if schema/privileges require changes. Owner/DB operator must authorize any production rollback action.

## Report conclusion

**Implementation staged; FINAL ACCEPTANCE PENDING.** This documentation work neither edited production code nor ran integration browsers. Acceptance requires the companion [ISSUE304_FINAL_ACCEPTANCE.md](ISSUE304_FINAL_ACCEPTANCE.md) matrix fully grounded in final frozen SHA artifacts, independent audit, reviewed screenshots and CI/PR evidence. No unsupported PASS is implied by commits, local artifacts or assertions in this report.
