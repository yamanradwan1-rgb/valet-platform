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
- New `scripts/issue300-r2-owner-key-custody.mjs` fails closed **before**
  opening the private PEM. On Windows it checks the task folder and PEM's
  owner SIDs and explicit protected DACLs using trusted system PowerShell,
  allowing only the current Owner identity, SYSTEM and Administrators;
  any other allow ACE or inherited DACL is denied. On POSIX it requires
  no group/other mode bits. This does not protect against the same
  already-compromised Owner identity or a privileged SYSTEM/admin actor.
- Custody review also walks the filesystem root and every ancestor through
  the ignored task folder, rejecting reparse ancestors, null DACLs,
  untrusted Owner SIDs, and untrusted write/create/delete/DELETE_CHILD/
  WRITE_DAC/WRITE_OWNER rights. Ancestors may allow ordinary read/traverse;
  the Owner directory and private PEM must have protected, restricted DACLs.
  Raw Windows ACE masks (not merely interpreted FileSystemRights) additionally
  reject GENERIC_WRITE, GENERIC_ALL, MAXIMUM_ALLOWED and unrecognized ACE
  qualifiers; ambiguous discretionary access is denied.
  Repeat all custody checks before and after publication; the underlying
  Windows DACL negative/rename-race integration test remains **NOT RUN**.
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
- Rechecks clean HEAD and ten-minute signed-lease expiry immediately
  before publishing and after verifying persisted bytes. Path/DACL and
  TOCTOU acceptance tests remain pending on a safe host.

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
