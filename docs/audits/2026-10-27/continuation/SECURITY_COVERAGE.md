# Security coverage and limitations

Baseline `66968655b8bd90c6681daf53fb9d8da9b9ab9f79`. Manual security worker saved13 full file reviews; coordinator independently challenged SEC-011 and inspected supporting source. This is incremental manual engineering/security review, not a completed formal security scan.

The sanctioned formal deep-scan coordinator tool was absent from the available tool catalog at resume. No formal scan was executed. The owner explicitly authorized continued manual review; search, model tests and dependency tools are not substitutes for formal deep-scan completion.

Covered trust boundary in detail: password-authenticated management session versus MFA recovery/enrollment authority. SEC-011 is HIGH-CONFIDENCE / RUNTIME UNVERIFIED; source/model evidence is separated from exploit proof. Cryptographic primitives, session/expiry locks and different-user separation were considered as disproof controls, not bypassed in the model.

Unfinished: remaining security-owned files; complete tenant/role graph; durable limiter/worker identity/revocation; private storage/integration boundaries; runtime privileges; all other inventory paths. Original formal scan, PostgreSQL integration, physical-device and external-provider limitations remain. No production or destructive security probing.

C003: Selected staff login/password/session revalidation and DB runtime-grant/provisioning source received semantic review. No new formal scan or live exploit/PG/HTTP test was executed. SEC-011 remains existing #363, with scope and runtime limits unchanged. DASH-AUTH-01 is new P2 high-source-confidence logout continuity risk under denied localStorage plus retained refresh cookie; browser runtime is unverified.

C004: Native foreground/check-in owner, push backup and release guard source reviewed; Dashboard auth/authority fixture sources inspected. No live exploit, security scanner pass, production test or user-device verification. Existing release risks remain unchanged.

C005: Transfer reviews inspected scope, auth, anti-abuse and contract edges. No formal security scan/live exploit or risk acceptance; prior P1 gates remain.

C006: Statically inspected dashboard MFA/CAS/tenant fences, API exact Staff/session/entitlement read scope, and Check-In ambiguity/custody tests. No provider/DB/device security scan was executed; earlier security findings and release gates unchanged.

C007: Static reviews inspected tenant/auth/MFA, SQL authority, guest continuity, GPS ingestion, check-in cancellation and racing states. Previous P1/SEC-011 and other gates remain; no new live security exploit verified.

C008 on updated main: reviewed SQL privileges, guest browser bearer/cookie/CSRF, tenant scope, payment/parking and worker lease fences statically. No new live exploit or runtime approval; existing P1 gates persist.

C009 on updated main: reviewed database runtime grants, staff authorization, incident operation/custody, shared contracts, tenant-aware UI state and Native foreground/static invariants. No new live exploit or runtime approval; existing P1 gates persist.
