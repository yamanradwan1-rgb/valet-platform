# VAYLET #309 W4 — isolated Management condition-photo read API

**Integration candidate only. Production deployment/release remains NO-GO.** This
branch does not enable photo-view authorization: W3's
`authorizeManagementSessionPhotoView` is deliberately **DENY by default** until
the Owner accepts a role/capability policy. A Management Dashboard read grant
must never imply viewing private Check-In photo bytes.

## Source and routes

- Base branch `459e9c42dfff5b2aeb11ee9165a7d1a4338a7783`; W3 owner-policy
  denial implementation cherry-picked from `705e2326` as `65251d77`.
- `GET /v1/staff/dashboard/locations/:locationId/sessions/:sessionId/condition-photos`
  returns `{items:[{photoId,verifiedAt,contentType:'image/jpeg'}]}`, bounded
  0–10, in verified-time descending order. No object key, bucket, digest,
  object version, S3 URL or signed capability leaves the server.
- `GET /v1/staff/dashboard/locations/:locationId/sessions/:sessionId/condition-photos/:photoId/bytes`
  returns the exact private JPEG bytes on successful separate bearer
  authorization. No query credentials or arbitrary object keys are accepted.
  Response uses `private,no-store`, `Pragma:no-cache`, `nosniff`, and
  `image/jpeg`; caller identities and hidden resources collapse to 404.

Both routes require one valid bearer Authorization header and exact persisted
Organization+Location+ValetSession binding under W3's independent authority.
The unmodified `selectVerifiedConditionPhotoCandidates` enforces verified
`CHECK_IN_CONDITION`, AVAILABLE, and max10. A separately scoped read-only
projection obtains `verified_at`. The private storage provider is a
deployment-approved `S3PrivatePhotoStore`; missing/invalid version or SHA256,
unavailable/oversized objects are never streamed.

For bytes, there are two short transactions separated by external S3 I/O:
first authorize/select, then readExact(version)/size/constant-time digest,
then **second** W3 authorization with the same exact session, original photo
identity verification and `FOR SHARE` locks on verified operation, attempt,
verification, availability. The handler calls `res.end` synchronously *inside*
this final DB lock-held callback, before committing. No transaction is held
across S3 or a slow socket flush. After enqueue, the HTTP response owns the
byte buffer and the in-flight reservation until `finish`/`close`.

## Security gates before release

1. **P1 runtime privilege/row-lock blocker:** existing
   `condition-photo-runtime-privileges.mjs` grants the runtime DB role
   **SELECT only** on `condition_photo_upload_operations`,
   `condition_photo_upload_attempts`,
   `vehicle_photo_verifications`, and `vehicle_photo_availability`.
   PostgreSQL `FOR SHARE` also requires the relevant UPDATE privilege.
   **W5 confirmed SQLSTATE 42501** under a real isolated PostgreSQL 17
   restricted runtime role for all four photo tables. This is a proven
   runtime blocker, not a theoretical or mocked permission gap.
   Do **not** broaden runtime UPDATE grants; a separately reviewed, tightly
   scoped `SECURITY DEFINER` read-lock helper or equivalent synchronization
   design is necessary, along with W5 restricted-role PG proof and race tests.
2. **P1 no network-receipt atomicity:** synchronously enqueuing bytes under
   the final auth/evidence transaction lock serializes against canonical
   revokers only at enqueue, **not** physical remote receipt. If final PG
   `COMMIT` fails *after* a successful `res.end`, the payload cannot be
   recalled. Product policy must explicitly accept/review this residual
   ordering or choose a stronger release protocol. Noncanonical privileged
   changes to object storage or database outside the writer protocol are
   not covered.
3. **P1 cross-replica concurrency:** the independently scoped, durable
   Management photo-view rate budget uses `v1:dashboard-session-photo-view-user`
   (120 per 15 minutes) and does *not* consume #215 employee status/upload
   quotas. The separate 4-global/2-per-user private byte in-flight cap
   persists until HTTP response `finish`/`close` **within each API replica**.
   A fleet-wide semaphore and operational limits/load tests remain necessary
   before enabling high-volume image responses.
4. **Owner decision:** no production permissions are silently inferred
   from `LOCATION_DASHBOARD_READ`, generic Management, or native staff
   photo upload rights. W3 deliberately returns no scope until photo-view
   policy approval. Keep production photo API fail closed in the meantime.

Tests in `apps/api/test/dashboard-session-photo.test.ts` are isolated fake-DB
contract tests exercising positive hypothetical authorizer injection,
post-storage revocation, checksum/version drift, exact session/tenant scope,
no internal metadata leakage, rate limits, lock-held response enqueue, and
slot release. They **cannot** substitute for W5's real restricted Postgres
and private MinIO tests.
