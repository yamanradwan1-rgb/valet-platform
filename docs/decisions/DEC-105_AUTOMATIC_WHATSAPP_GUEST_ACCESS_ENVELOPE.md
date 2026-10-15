# DEC-105 — Short-lived WhatsApp Guest Transport Envelope

Status: Accepted for the Owner-authorized Stage C **disabled/mocked** implementation only; live use remains gated.
Date: 2026-10-15
Scope: WA-D02, initial Guest link on a newly created eligible Intake only.

## Narrow exception to existing hash-only rule

The Owner selected WA-D02 in the committed plan and explicitly authorized code implementation in this task. Existing DEC-064 and security rules ban all durable reversible Guest bootstrap copies. This decision creates the **only** narrowly permitted exception: one encrypted initial bootstrap transport envelope associated with one initial outbound intent. Session and Browser Session authority remain verifier-hash-only. No rendered link, name, plate, vehicle data or phone plaintext may be persisted in the envelope. No generic recoverable credential vault is authorized. Live activation still requires an independent key-custody/restore/privacy review.

## Cryptography, scope and lifetime

- Issuer encrypts the exact 43-character bootstrap token using audited Node RSA-OAEP-SHA256 with a deployment-provided >=3072-bit public key. The OAEP label is canonical versioned associated data, binding Organization, Location, visit, Customer, intent, generation, HMAC recipient digest and expiry. Ciphertext and authenticated label are verified by the sender; alteration fails closed. Unique random OAEP padding supplies nondeterminism.
- Issuer only receives the public key. A separate, restricted sender owns the private key. No private key may be passed to the custody API or persisted in SQL, Git, browser, logs or exported traces. Key versions are explicit and must never silently fall back. The HMAC recipient key is separate and versioned; enumerable phones cannot be stored as plain SHA hashes.
- Ciphertext survives only while a definitely-unsent retry is eligible, at most 30 minutes after issuance. Purge on acceptance, UNKNOWN, permanent failure, suppression, withdrawal, revocation, completion, cancellation and expiry. The irreversible dispatch marker prevents a crash from making an uncertain external call retryable. No credential recreation follows an uncertain send.
- SQL envelope access is limited to narrowly scoped, tenant-verified sender operations; sender cannot mutate custody, Guest generations or arbitrary messaging intents. Migration, API, sender and webhook DB roles are separate. Backups can retain encrypted copies beyond operational deletion: production activation requires reviewed backup expiration, key destruction, breach and restore runbooks.
- Logs, error text, metrics, analytics, HTTP captures, audit metadata and frontend must exclude raw token, URL, ciphertext payload, plaintext phone, full recipient digest and raw Meta body. Versioned safe IDs and finite reason codes are allowed.

## Release fences

Initial feature flags and durable kill switch are OFF. No implicit employee-entered number is treated as verified WhatsApp opt-in. Real sending additionally requires accepted consent evidence, provider/account onboarding, approved templates, demonstrated fragment preservation, isolated credentials, restricted-role proof, audit and backup lifecycle verification and explicit approval. No automatic SMS fallback.

This decision supersedes only the reversible-copy prohibition for this single short-lived outbound transport. DEC-064's hash-only Guest/Browser Session storage, one-time exchange, 24-hour bootstrap expiry and fragment transport remain authoritative elsewhere.
