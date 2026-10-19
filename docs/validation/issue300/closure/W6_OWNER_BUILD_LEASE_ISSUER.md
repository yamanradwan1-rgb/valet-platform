# W6 — Owner-only W17 build lease issuer (source-only)

## Discovery

Source baseline: integrated `7b9b760322133d8881124a147db743617d53a33c`.
The existing `scripts/issue300-r2-owner-build-issuer.mjs` reads a
**pre-existing** W17 build lease and signs the *post-build receipt*.
It **does not** generate the signed, pre-build
`W17_BUILD_LEASE_<candidateSha>_<leaseId>.json[.sig]` pair.
The real consumer is `scripts/issue300-r2-owner-build-lease.mjs`.

## New isolated source

- `scripts/issue300-r2-owner-build-lease-issuer.mjs`: Owner-only
  pre-build issuer. Requires exact clean HEAD, `NODE_ENV=test`,
  `ISSUE300_R2_CANDIDATE_SHA=<exact HEAD>`, and
  `ISSUE300_W17_OWNER_LEASE_ISSUE_ENABLE=1`. Exact CLI mode
  `--issue` only. No API, database, network or build actions.
- Reuses the source-pinned Owner Ed25519 identity, unchanged existing
  Owner path constraints and protected private key location
  `tmp/issue300-r2-v2-prime-owned/issuer-private.pem`. No code
  reads/prints/copies the real key except a future explicitly authorized
  Owner-only issuance; this worker has not accessed it.
- Random crypto-generated `issue300-r2-w17-<40 lowercase hex>`
  lease ID; ten-minute TTL (below the fifteen-minute maximum).
  The raw JSON contains **only** version, purpose, candidateSha,
  leaseId, issuedAt and expiresAt, matching the consumer exactly.
- Writes the JSON using exclusive `wx`, followed by an exclusive
  `wx` detached Base64 Ed25519 signature over **exact raw JSON bytes**.
  Refuses existing files, symlinks, hardlinks, junctions and path aliases
  using existing strict Owner helpers and an exact root ancestry guard.
  No unsupported binary or JSON signature envelope is produced.
- Re-reads both files and verifies the persisted raw JSON, digest and
  Owner-pinned signature before returning only public receipt metadata.
  A failed second write cannot produce a verified pair; no broad cleanup.

## Validation and limitations

The test file uses **ephemeral Ed25519 keys only** and explicitly injects
its disposable public verifier into the unchanged consumer. Positive
and negative tests cover exact consumer schema, clean-SHA/Owner opt-in
gates, tampered/wrong-key/unsigned/future/expired/overlong leases,
hardlinks, root symlinks and `wx` non-overwrite behavior.

**SOURCE-ONLY / NOT ACCEPTED** until offline test execution passes in a
safe host window and independent Owner review. This change does NOT
mint any real signed lease, perform a W17 build, sign the build receipt
or change U005 runtime trust. Real issuance remains an explicit
separate Owner-controlled action after integration and approval.
