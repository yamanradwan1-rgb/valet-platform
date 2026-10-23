# VAYLET #324 — Gitleaks historical owner triage (sanitized)

**Scope:** 29 suspected Gitleaks sites listed in MASTER_DISPOSITION.md, one row per historical site; no credential values, token fragments, hashes of values, or rotation material are reproduced here. This is a static source/ownership triage, not credential validation or production verification.

**Source anchors:** the disposition labels all rows as scan SHA c12500a816e588edac9059d3aa559f9039f8535f; the integrated candidate inspected is b8fcf4d59df22c264e4a85a5e4b1f2dacdf34f8b, based on main 2bee94f200677176368e14edc64928c779c884fe. The historical locator (path + line + Gitleaks rule) is an input claim, not independent proof that the corresponding literal at that line is a usable secret. Git object inspection was limited to path/revision existence, safe syntactic markers and file roles. No secret values were emitted, copied, tested, or sent to third-party services.

## Decision and classification

| Classification | Count | Interpretation |
| --- | ---: | --- |
| Fixture | 16 | Test/E2E-only source or helper; a scanner match alone does not prove an active credential. |
| Example | 11 | Documentation/schema/plan/evidence example or illustrative text; validity and provenance are unverified. |
| Public client | 1 | Firebase Android client configuration field, publicly distributable by design when correctly scoped. |
| Dev-only | 1 | Issue #300 PostgreSQL test-key writer under the API test directory; no identified production invocation. |
| Potential privileged, confirmed by source | 0 | No inspected source path establishes an active production server/admin/service-account key. |
| Unknown source role | 0 | Roles are identifiable; **live validity is unknown for all 29** without owner evidence. |
| **Total** | **29** | Counts preserve every historical scanner row, including repeats in the same file. |

No source-confirmed P0/P1 credential exposure is established by these records. Do not mark Gitleaks closure as fully attested: no private provider-console validation, exact raw-match provenance check, live usage verification, or owner sign-off occurred. A later confirmation that any item is an active privileged credential exposed in public history would be a **release blocker** requiring an incident/owner decision; its severity would depend on service, scope and exploitation potential. No rotation is requested or performed by this report.

## One-to-one historical site matrix

All entries use historical scanner rule generic-api-key, except G05, whose rule was gcp-api-key. “Present” means the file is in candidate b8fcf4d5; “historical-only” means the named file was absent from both c12500a8 and b8fcf4d5 but is present in Git history. Categories classify file role, **not** whether a matched value was ever operational.

| ID | Historical locator (path:line) | Category | Safe source evidence and limits | Owner check |
| --- | --- | --- | --- | --- |
| G01 | apps/api/test/issue300-pg/issue300-operational-checkin-key-writer.mjs:191 | Dev-only | Present; API Issue #300 PostgreSQL test writer. Line metadata does not itself show a credential literal. | API/QA: confirm writer and test database identities never use production credentials. |
| G02 | apps/dashboard/e2e/md-r08-audit-security.spec.ts:15 | Fixture | Present; E2E audit/security test object includes an MFA test field. | Dashboard QA: verify test MFA material has no real operator/account reuse. |
| G03 | apps/dashboard/src/features/dashboard-overview/overview-endpoints.test.ts:151 | Fixture | Historical-only; former overview endpoint test, safe test markers in historical Git. | Dashboard QA: confirm old fixture did not originate from live authentication material. |
| G04 | apps/dashboard/src/features/dashboard-overview/overview-endpoints.test.ts:189 | Fixture | Same historical-only test file as G03; retained as a distinct scanner location. | Dashboard QA: same private-origin check, separately for this finding. |
| G05 | apps/valet-native/google-services.json:18 | Public client | Present; standard Firebase Android current_key field. Public project/app identification is not a server authorization secret. Actual cloud restrictions unverified. | Firebase/Google Cloud project admin: verify key owner, allowed APIs, Android app restrictions, security rules, App Check and usage/quota evidence; details below. |
| G06 | apps/valet-native/test/native-guest-access-runtime-test-support.ts:7 | Fixture | Present; test support consumed by native test files. | Native QA: verify isolated test tokens and accounts. |
| G07 | apps/valet/e2e/employee-app-logout.spec.ts:5 | Fixture | Present; employee logout E2E test token declaration. | Employee web QA: ensure token fixture has no live issuer or account reuse. |
| G08 | apps/valet/e2e/staff-logout-restoration.spec.ts:6 | Fixture | Present; staff restoration E2E old-access test declaration. | Employee web QA: confirm synthetic/isolated old-access token. |
| G09 | apps/valet/src/features/employee-web-push/employee-push-api.test.ts:17 | Fixture | Historical-only; reverted employee web-push test source. | Employee push QA: verify no active production push/account credential reused. |
| G10 | apps/valet/src/features/employee-web-push/employee-push-manager.test.ts:130 | Fixture | Historical-only; reverted employee web-push manager test source. | Employee push QA: verify this distinct historical test value separately. |
| G11 | apps/valet/src/features/guest-access/guest-access-controller-test-support.ts:10 | Fixture | Present; test-support module is referenced by guest-access controller test files, not identified as runtime entrypoint. | Guest-access QA: confirm fixture is synthetic, not a live browser/guest token. |
| G12 | apps/valet/src/lib/api/employee-api-client-regression.test.ts:7 | Fixture | Present; employee API client regression test access-token declaration. | Employee web QA: confirm issuer/account isolation. |
| G13 | apps/valet/src/lib/api/employee-api-client.test.ts:7 | Fixture | Present; API client test, but recorded exact line is blank in the candidate and c12500a8 inspection. | Employee web QA/scanner owner: locate actual historical match without sharing literal. |
| G14 | apps/valet/src/lib/auth/staff-auth-client-refresh.test.ts:5 | Fixture | Present; explicitly named mock-token declaration in staff auth refresh test. | Staff auth QA: attest that mock token is not issued by a real production signer. |
| G15 | apps/valet/src/lib/auth/staff-auth-client.test.ts:5 | Fixture | Present; staff auth test, but recorded exact line is blank in the candidate and c12500a8 inspection. | Staff auth QA/scanner owner: reconcile source line and confirm isolation. |
| G16 | apps/valet/src/lib/auth/staff-auth-logout-intent.test.ts:5 | Fixture | Present; staff auth logout test token declaration. | Staff auth QA: confirm test-only token origin. |
| G17 | docs/03_DATABASE_SCHEMA.md:2675 | Example | Present; schema/credential documentation context, with no production credential proven at this locator. | Docs/database owner: attest examples are illustrative or redacted. |
| G18 | docs/04_VALET_SESSION_STATE_MACHINE.md:147 | Example | Present; state machine documentation, but the recorded line is blank in inspected revisions. | Docs owner/scanner owner: reconcile line and source provenance. |
| G19 | docs/14_PROJECT_STATUS.md:119 | Example | Present; project status documentation, but the recorded line is blank in inspected revisions. | Docs owner/scanner owner: reconcile line and source provenance. |
| G20 | docs/ISSUE-232_PHYSICAL_RESOURCE_QR_CONFIGURATION_EVIDENCE.md:168 | Example | Present; QR/configuration evidence discusses credentials, tokens and secrets; no usable key established by the text role. | Issue #232 evidence owner: confirm examples are sanitized and did not copy live values. |
| G21 | docs/MD-R10_REPORTS_VISIT_CONTACTS_EVIDENCE.md:63 | Example | Present; reporting evidence table/test fixture context. | Reporting QA/docs owner: confirm fixture provenance. |
| G22 | docs/decisions/DEC-071_BACKGROUND_WEB_PUSH_ARCHITECTURE.md:639 | Example | Historical-only; reverted architecture decision text for background web push. | Web-push architecture owner: confirm any historical examples were not provider/private signing keys. |
| G23 | docs/decisions/DEC-071_BACKGROUND_WEB_PUSH_ARCHITECTURE.md:716 | Example | Same historical-only decision document, independent scanner site. | Web-push architecture owner: check this location independently. |
| G24 | docs/decisions/DEC-071_BACKGROUND_WEB_PUSH_ARCHITECTURE.md:765 | Example | Same historical-only decision document, independent scanner site. | Web-push architecture owner: check this location independently. |
| G25 | docs/plans/ISSUE_300_AUDIT_INVESTIGATION_MASTER_PLAN.md:611 | Example | Present; Issue #300 investigation plan table, no active operational credential demonstrated. | Issue #300 owner: confirm planning artifacts contain synthetic identifiers only. |
| G26 | docs/plans/dashboard-issues-236-243-implementation-plan.md:531 | Example | Present; staff authorization/token discussion in implementation plan, not established credential material. | Dashboard plan owner: attest examples/redactions, especially if copied from HTTP evidence. |
| G27 | docs/validation/ISSUE_240_TASK05_CLOSURE.md:202 | Example | Present; historic task validation/closure record. | Issue #240 evidence owner: confirm no live tokens pasted into report. |
| G28 | packages/contracts/src/web-push.test.ts:87 | Fixture | Historical-only; reverted shared web-push contracts test. The historical added-version locator did not reproduce a candidate line literal. | Contracts/push QA and scanner owner: reconcile historical locator and check fixture provenance. |
| G29 | packages/employee-client/src/qr-input.test.ts:93 | Fixture | Present; QR-input test, though the recorded line resolves to a reason field rather than an identified key literal. | Employee client QA/scanner owner: identify actual scanner match privately. |

## Historical revision and provenance limitation

Eight sites are not in the historical scan-label commit **or** the integrated candidate: G03, G04, G09, G10, G22, G23, G24 and G28. Git history contains those former files, including the employee web-push and DEC-071 content later reverted. Thus, c12500a8 must not be presented as an exact file/line forensic snapshot for all 29 rows. At least G13, G15, G18 and G19 point to blank lines in inspected revisions; G29 points to a non-key-shaped field. Scanner output may have been produced from a different worktree, revision, line-number basis or aggregated historical inputs. The available sanitized summary cannot distinguish these causes.

An absent or reverted file **does not remove historical exposure** if a real privileged value was committed. To resolve those rows, the scanner owner should provide a provenance-only reconciliation (scan target/revision, file state, rule, match location and a protected comparison against owner-side credential inventory). Do not paste matched strings, tokens or fingerprints derived from short/guessable credential values into this repository, issues or chat. The original historical scanner row remains open as owner evidence until reconciled.

## Firebase / Google API key: distinct owner action

G05 is the Android Firebase configuration field (google-services.json / current_key). Firebase explicitly documents such client keys as public project/app identifiers: database/storage authorization relies on IAM, Firebase Security Rules and App Check, not secrecy of that field. “Public client” does **not** mean every Google Cloud API enabled on that key is safe.

The Firebase/Google Cloud project administrator must verify in the correct project's Credentials console, **without publishing the key**:

1. The key corresponds to the intended VAYLET Android Firebase app and environment (production versus test/staging).
2. API restrictions permit only the Firebase-related APIs actually needed. Explicitly inspect unexpected billable/non-Firebase APIs; use separate, tightly restricted keys for any such service. Verify that privileged APIs such as Generative Language API are not exposed through the public client key.
3. Application restrictions match approved Android package names and signing certificate SHA-1 fingerprints where appropriate, including relevant release/debug identity differences, without breaking Firebase's required API calls.
4. Firebase Security Rules, App Check coverage and quota/usage alerts are suitable for the deployed Firebase products. Record only yes/no/exception evidence and owner/date, not credentials.

Owner verification outcome: **PENDING**. If restrictions reveal effective access to a privileged/billable API beyond the intended client boundary, escalate the actual capability and impact for security release disposition. The mere presence of current_key in a distributed Android app is not itself a leaked server key and does not justify blind rotation.

Primary guidance: [Firebase API keys](https://firebase.google.com/docs/projects/api-keys); [Google Cloud API/application key restrictions](https://docs.cloud.google.com/api-keys/docs/add-restrictions-api-keys).

## Owner closure protocol and release effect

- **Security/scanner owner:** reconcile all 29 preserved rows to the original scanner evidence without exporting values; prioritize the eight historical-only records and source-line drift. Record which values, if any, correspond to an actual provider-issued privileged key in a private approved credential-inventory process.
- **QA/test owners:** attest that fixture/E2E tokens, MFA examples, guest access, push material and Issue #300 test writer data are synthetic/isolated and never reused for production identities. Path naming alone does not prove that assertion.
- **Docs/evidence owners:** attest that example strings in the 11 records were generated, redacted or synthetic; if copied from operational logs, report to security privately.
- **Firebase/Google Cloud admin:** close G05 only after project-specific API/application restriction, Rules/App Check and quota verification. Share configuration conclusions, never the key value.
- **Release owner:** continue conditional Gitleaks owner-evidence status in MASTER_DISPOSITION and PR334_CI_ACCEPTANCE until signed-off reconciliation. **Source evidence alone has not confirmed a privileged exposure requiring an immediate credential rotation**; any confirmed active privileged historical exposure is a release blocker for the affected service pending approved incident response.

No production service, database, cloud console, protected scanner output or credential validity endpoint was accessed. No source changes, scan reruns, dynamic requests, rotation, CI gate changes, merge or deployment were part of this triage.
