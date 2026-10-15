# Issue #215 / #282 local real-S3 qualification

This is a disposable Docker fixture for validating the existing condition-photo
S3 adapter against **actual MinIO**, including its IAM and versioning behavior.
It is not an approved production storage provider or retention/KMS deployment.

From the repository root, with Docker Desktop and pnpm dependencies installed:

```sh
node scripts/issue215-local-s3/start.mjs
node scripts/issue215-local-s3/run.mjs
node scripts/issue215-local-s3/stop.mjs
```

The startup script refuses to reuse an existing container. It creates a
task-owned Docker Compose project `issue215-s3-worker4`, exposes only a
random host port on `127.0.0.1`, keeps all object data in container `tmpfs`,
and generates isolated root, app and KMS credentials. The local credentials are
saved only in ignored `.runtime.env` and `.runtime.json`; never copy them into
source control or a real deployment.

The setup provisions a private, versioned bucket `issue215-s3-worker4` and a
separate application identity with permission only for `PutObject`, `GetObject`
and `GetObjectVersion` under `condition-photo/*`. It has no object
delete, version delete or bucket listing rights. Its short-lived 256-bit
`MINIO_KMS_SECRET_KEY` enables the adapter's mandatory `AES256` SSE request.

`run.mjs` injects `ISSUE215_REAL_S3_ENABLED`,
`ISSUE215_S3_ENDPOINT`, `ISSUE215_S3_BUCKET`,
`ISSUE215_S3_ACCESS_KEY_ID` and `ISSUE215_S3_SECRET_ACCESS_KEY` from
the fixture file. The focused suite is skipped by normal unit/CI runs that do
not opt into an explicitly provisioned real provider. A green normal CI run
alone cannot qualify S3. Successful explicit `run.mjs` must report
**six executed passing tests**, zero skipped.

The assertions cover conditional PUT, concurrent creators, exact version
GET/HEAD and bytes/digest, SSE, wrong versions, private anonymous GET/LIST,
denied signed LIST/DELETE/DeleteVersion, restricted object prefixes, lost
PUT acknowledgements after a real provider commit, and stalled exact-version
GETs.
Test payloads are synthetic adapter bytes, not decoded photographs.
The provider identity's permissions do not prevent a *new version* from an
unconditional PUT; qualification relies on the adapter's conditional PUT and
on readback of the immutable **exact version**. Production durability,
backup/restore, legal retention, holds, TLS and provider approval remain open.

Stop removes only the proven owned Compose fixture, including its tmpfs data.
The cleanup script verifies exact owner labels before acting.
Original community `quay.io/minio/minio` images currently return 401; this
fixture pins the two Chainguard community MinIO images by full digest.
