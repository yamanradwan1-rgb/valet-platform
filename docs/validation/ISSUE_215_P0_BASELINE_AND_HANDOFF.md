# Issue #215 — P0 owner decision, pinned baseline and implementation handoff

Status: **P0 DOCUMENTATION/OWNER DECISIONS COMPLETE — P1 ELIGIBLE FOR SEPARATELY ASSIGNED IMPLEMENTATION; RUNTIME/RELEASE NOT VERIFIED**
Date: 2026-10-14 (Asia/Amman)
Issue: [#215](https://github.com/yamanradwan1-rgb/valet-platform/issues/215)
Full engineering plan: [Issue #215 master plan](../plans/ISSUE_215_VERIFIED_CONDITION_PHOTO_MASTER_PLAN.md)
Accepted owner decision: [DEC-104](../decisions/DEC-104_VERIFIED_CONDITION_PHOTO_BYTE_EVIDENCE.md)

## 1. Authority, baseline and evidence levels

| Item | P0 evidence / scope |
| --- | --- |
| Audited remote application `main` | `923b5ce595fd2a2df9eadc6c7aa5041bd0bb7a93` (fetch checked 2026-10-14) |
| Master plan baseline/commit | `a979493e43d42361b3083fa67e1d0eef00514311` |
| Owner decision branch commit | `90df77aee85c220cec3ea0d0f7551e2e6e692d03` |
| Decision conflict | Historical proposed photo `DEC-075` is not accepted; `DEC-075` on `main` is accepted Staff Push policy; new unique `DEC-104` owns this photo decision |
| Blueprint | Founder & Product Blueprint v1.0 reviewed from the **owner-provided external attachment** for this P0 review (not present in the repository reference tree): default-optional/location-configurable photos; photo evidence linked to a Session and permission-controlled. Repository-native authority for future agents: `docs/15_BLUEPRINT_V1_REBASELINE.md` |
| Repository documents inspected | `AGENTS.md`, `docs/00–17` relevant source/security/state/schema/workflow docs, `docs/20_EMPLOYEE_NATIVE_EXECUTION_PLAN.md`, relevant accepted decisions; plan section 2 retains the full read manifest |
| Actual evidence level | Git/source inspection and owner decision. **No production API, private store, DB migration, Android build, screenshot, physical QA, or CI execution is claimed** |
| Current code/worktree protection | P0 changes are documentation only; no API, Native, schema, migration, style, dependency, credential or environment changes |

This record is the exact P0 handoff, **not** a production approval or proof that all later work is complete. Baseline hashes below apply only to the pinned application `main`; subsequent implementation must re-fetch and compare the actual base/branches before editing.

## 2. Verified source-state and dependency checks

| Boundary | Evidence from pinned source | P1–P6 invariant |
| --- | --- | --- |
| Photo evidence guard | `apps/api/src/modules/valet-sessions/check-in-condition-command.ts`, `evaluateLockedCheckInConditionGuard()` uses `FALSE AS qualifying_photo_present` | Do not flip to `TRUE` or trust metadata; P3 enables only server-verified exact-session objects after P2 |
| Current Check-In completion | `apps/api/src/modules/valet-sessions/complete-check-in-command.ts` uses photo-required guard and locked session; relevant regressions in `apps/api/test/{check-in-condition-command,complete-check-in-command,check-in-api}.integration.test.ts` | Optional policy and current condition/custody/CAS semantics unchanged; required fails closed until verified |
| Existing stored photo | `packages/database/prisma/schema.prisma` `VehiclePhoto`; no trusted byte-verification evidence on baseline | Legacy metadata rows remain explicitly non-qualifying; P1 owns any additive migration and least-privilege grants |
| Actor scope | `check-in-condition-authorization.ts` and `custody-staff-authorizer.ts` resolve persisted org/location and authorize current active Employee/Supervisor explicit access | Keep no-new-Shift/no-new-intake-owner behavior for upload; do not import unrelated #255 cancellation rules |
| Auth identity | `auth/staff-session-context.ts` resolves current token; `auth/staff-session-revalidation.ts` rechecks current access hash and expiry under user security advisory + session row lock | P2 must repeat exact credential checks at finalization; membership-only recheck is insufficient |
| Native Check-In | `apps/valet-native/src/check-in/native-check-in-condition-step.tsx` has three condition options, optional notice, Continue/error but **no photo capture** | Only QR-pattern UI-X1 scoped addition; frozen existing screen outside new photo area |
| Existing camera reference | `apps/valet-native/src/scanner/native-qr-panel.tsx`, `parking/native-parking-qr-input.tsx`, `handoff/native-handoff-scanner.tsx` | Reuse look/feel, buttons, permissions, close/Back and feedback; new JPEG is an independent image capture, never QR/OCR bytes |
| Scoped portable client | `packages/employee-client/src/employee-check-in-condition-session.ts`, `employee-check-in-condition-recovery.ts` | P4 owns guarded photo upload/recovery transport; no client-asserted verification or silent mutation retry |
| Related navigation | GitHub [#263](https://github.com/yamanradwan1-rgb/valet-platform/issues/263) is **CLOSED** and defines one-step Back correction and safe resume, not arbitrary history | Photo capture Back must return to its owning condition step without consuming or bypassing the existing correction window |

### Pinned UI/source manifest — before implementation

| Frozen/reference file | Blob SHA in pinned `main` | Evidence use |
| --- | --- | --- |
| `apps/valet-native/src/check-in/native-check-in-condition-step.tsx` | `4572848138114f305ce56511d19555eda1b9fb15` | Frozen Vehicle Condition options/notice/actions |
| `apps/valet-native/src/scanner/native-qr-panel.tsx` | `aaac6c2aff69d425141ee2cf2e3650fd3e7849ac` | QR modal camera reference |
| `apps/valet-native/src/parking/native-parking-qr-input.tsx` | `0545c44373932bbb345594a7f311c69485622d95` | QR inline camera/status reference |
| `apps/valet-native/src/handoff/native-handoff-scanner.tsx` | `830a0edf396fd7f7c0c7b44ac5c034bc31751328` | QR permission, open/close/focus reference |
| `apps/api/src/modules/valet-sessions/check-in-condition-command.ts` | `3cd7bbf228ade6d77bec2964a1a48fcd8a2df7f8` | Existing fail-closed guard |
| `apps/api/src/modules/auth/staff-session-revalidation.ts` | `b43b03ea7bec2b2b42c52452b91ec9473034f360` | Exact credential recheck reference |

**Screen capture limitation:** No baseline physical screenshot/Android render was collected during this P0 documentation-only task. Do **not** label these source blobs visual proof. P4/P6 must capture real **BEFORE** reference evidence from a pinned matching baseline device/build, EN/AR, Light/Dark, 360/393/412 dp, insets/font scale/TalkBack, matched policy/session fixtures, then compare **AFTER** results. Reference original QR-camera behavior to verify the approved photo exception, rather than assuming source similarity guarantees pixel parity. If a required baseline cannot be reproduced, report that release evidence gate as blocked rather than backfill invented screenshots.

## 3. Locked owner decisions (DEC-104)

- **U-001:** authenticated bounded server-mediated JPEG upload, private S3-compatible storage; no trusted client key.
- **U-002:** separate persistent operation, fenced attempts and server-verified evidence; exact actor/org/location/session binding; bounded maximum **10 evidence photos/session**.
- **U-003:** initial 8 MiB / 4096 px-side / 12 MP plus candidate decode/upload/lease/expiry/cleanup limits; **benchmark before release**, not proven capacity.
- **U-004:** durable limits and user/session-wide concurrency/anti-abuse; **load test before release**, not proven throughput.
- **U-005:** EXIF-stripped normalized JPEG, private encrypted/authorized evidence, orphan-only cleanup and preserved verified objects. **Provider/bucket, contractual retention/legal hold/scanner stance/backup custody unresolved for production.**
- **U-006:** exact active field Employee/Supervisor + explicit location authority, current user/membership/session revalidation, no new Shift gate, explicit same-member authorized recovery and no automatic upload replay.
- **U-007:** Native required-photo feature and portable transport only. Employee Web remains fail-closed for required photos; no Guest/public read/gallery in #215.
- **UI-X1:** existing QR-camera visual/interaction pattern only, for explicit new condition JPEG capture/review/progress/error/retry. Existing layouts and every unrelated surface **STRICT UI-FROZEN**.

The source-of-truth decision is DEC-104; original proposed U descriptions in the master plan are preserved as historical proposal records, not still-open owner choices. No on-device/test acceptance is inferred from this decision.

## 4. Focused auth and concurrency P0 investigation

Read `auth/staff-user-security-lock.ts`, `auth/staff-session-revalidation.ts`, `auth/staff-auth.service.ts`, `auth/staff-auth-logout.ts`, `auth/staff-session-revocation.ts`, `check-in-condition-authorization.ts`, `complete-check-in-command.ts`, and `management-settings-lock.ts`.

- Exact recheck already exists: `lockAndRecheckStaffSessionContext()` first takes the `staff-user-security` advisory for the authenticated User and then locks the exact StaffAuthSession row with current access-hash, status, creation, revocation and expiry filters.
- Refresh currently takes the User security advisory via `lockStaffRefreshUserSecurityBoundary()` before locking refresh, session and user rows. **Logout** first locks `staff_refresh_credentials` and `staff_auth_sessions` rows and then calls revocation; it does **not** acquire the same User advisory in that path. Therefore a new upload T2 must **not assume** every auth writer uses the same existing lock prefix or that adding an advisory always makes a total order.
- Photo-authorized condition mutations take existing User/tenant/current membership/location protection and ValetSession locks; policy guard reads locked policy and is `FALSE` for verified evidence. `lockManagementSettingsOrganization()` uses a separate org-scoped advisory for policy changes. The new T2 must specify and prove exact lock ordering versus all auth refresh/logout/disable, current location/membership/policy and session completion/cancellation writers.

**P1/P2 mandatory proof before enabling photo finalization:** draw lock graph from current actual call chains; test adversarial transaction pairs using an isolated disposable PostgreSQL database (refresh/logout/disable vs T1/T2; membership/location revoke vs T2; settings change vs session completion; two photo ops and cleanup vs commit). Demonstrate no stale-token commits, deadlocks, lock inversion, phantom old authority, or unauthorized cross-scope results. If proof exposes an incompatible existing writer order, stop for a narrowly reviewable design correction; no global auth refactor is authorized by P0.

## 5. Phase eligibility and unresolved operational gates

| Gate / owner | P0 conclusion | Next accountable phase |
| --- | --- | --- |
| Decision identifier and product choice | DEC-104 Accepted; DEC-075 Staff Push intact | **P0 closed as owner/documentation work** |
| Proposed API/status/error model; DB authority and exact-session rules | C1 adopted by DEC-104; current server has no implementation | P1 schema/contracts and independent DB/security review |
| Exact auth/lock compatibility | Existing implementation mapped, concurrency safety **not proven** | P1/P2 isolation, transaction tests |
| Concrete Native style exception | QR-camera look/flow approved, exact UI X1 bounds/copy/focus not rendered | P4 builds minimal style-matching implementation; P6 owner reviews measured delta |
| Actual private S3 bucket/provider, credential custodian and deployment identity | Not specified; never fabricate credentials/provider | Must be supplied before P2's real-provider qualification and production rollout |
| Photo retention, legal/incident holds, export/restore and scanning threat model | Principles adopted, exact operational values remain open | Must be agreed before P5/production; never delete verified evidence by guess |
| Isolated disposable PostgreSQL + object-storage test targets | Not provisioned/tested by P0 | P1/P2 test owners must verify target safety prior to migrations/object writes |
| Physical Android devices, QA/release/rollback/review owners | Not furnished/assigned by this decision | P4/P6 owner qualification |
| Issue closure | #215 remains open and mandatory photos fail closed in existing main | P6 after end-to-end verified evidence, CI/security/device/UI proof |

**P1 start condition:** owner may assign a separate P1 branch from the accepted merged P0 SHA and execute the P1 standalone prompt from plan section 23 **after verifying latest main/any drift** and setting up an isolated disposable database target. Do not delay schema/contract design solely because a production S3 provider or legal retention period remains open; design these as configurable, fail-closed gates, not invented production policy. Do not run migrations on shared/unknown/production PostgreSQL without separate authorization.

## 6. Evidence checklist and P0 verdict

- [x] Fetched and pinned actual `origin/main` with unmodified source audit.
- [x] Read relevant repository docs/source, original Founder Blueprint for product intent, historical collision and #215/#263 issue context.
- [x] Recorded owner acceptance of U-001–U-007 and QR-pattern UI-X1 in unique DEC-104 and decisions log.
- [x] Recorded current code fail-closed policy, actor scoping, auth and QR references with source-blob fingerprints.
- [x] Preserved strict UI-FROZEN and explicitly separated new-photo exception from existing frozen screen.
- [x] Mapped database/API/recovery/failure, authorizer and exact credential lock requirements to P1/P2 without claiming proof.
- [x] Isolated operational owner decisions and pending real provider, Android, CI and pixel-reference evidence.
- [ ] Real production/private object store provision and qualified; **NOT a P0 task**.
- [ ] Physical screenshot/device and exact UI parity acceptance; **not performed in P0**.
- [ ] P1–P6 code, tests, deployment and #215 closure; **not performed in P0**.

**Verdict: P0 GO for documentation/decision handoff and P1 assignment; NO-GO for required-photo production completion, claiming Android UI parity or closing #215.** Merge and project update need their own Git verification; never label a docs commit as functional delivery.
