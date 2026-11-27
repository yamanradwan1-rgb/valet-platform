# Issue #463 — P7 quarantined restore test boundary

This is **disposable test evidence**, not an operational disaster-recovery
implementation or Gate C authorization. The snapshot is taken inside the
same attested, isolated PostgreSQL 17 container before the E-side disposition,
then restored into a separate, newly created database. P7 verifies that the
runtime role cannot CONNECT, that the signed synthetic ledger controls
reconciliation, and that actual E-only SQL re-erases the precise visit/case
while the numeric rating survives. Traffic admission remains **DENY**.

**Immediate recovery only:** the restored approval is still subject to the
original short SQL validity window (10 minutes in this fixture). After it
expires, the normal E-only routine refuses execution. No bypass, approval
extension, new authority, or provider attestation is assumed. This proof
cannot certify delayed backup recovery or durable external ledger storage.

The P7 helper pre-attests absence of both the target database and archive.
It attempts database and archive cleanup independently, and a failed cleanup
remains a failure. The expiry reconciliation checks for residual due PRESENT
comments after the bounded SQL sweep; any remainder returns UNKNOWN and
keeps replay blocked. The exact original P7 container is also removed by
the outer runner's finally on normal execution.

The accompanying `issue463-browser-restore-source.test.mjs` provides
**source-contract assertions only**; it does not execute PostgreSQL,
exercise failure injection, or replace the real P7 evidence.
