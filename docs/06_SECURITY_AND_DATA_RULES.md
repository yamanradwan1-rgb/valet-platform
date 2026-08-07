# Security and Data Rules

Status: Binding  
Version: 0.1

## Priority threats

- unauthorized vehicle release
- cross-tenant data exposure
- guessed/stolen customer access link
- OTP brute-force/reuse
- employee account misuse
- evidence tampering
- public vehicle photos
- fraudulent payment callbacks
- loss of audit history

## Staff authentication

- secure password hashing using Argon2id or approved equivalent
- short-lived access token
- rotated/revocable refresh token
- account disable support

## Customer access

MVP does not require customer passwords.

Use:

- cryptographically unguessable scoped token
- session-specific authorization
- expiry/revocation policy
- only customer-safe actions

## Authorization order

Protected operations verify:

1. authentication where required
2. organization membership
3. location access
4. role permission
5. resource ownership

## OTP handoff

- cryptographically secure generation
- short expiry
- store only hash
- attempt limit
- rate limit
- single use
- no OTP value in logs/audit metadata

Manager override:

- restricted role
- mandatory reason
- explicit audit event

## Vehicle photos

- private S3-compatible bucket
- short-lived signed URLs or authorized backend proxy
- MIME/type/size validation
- never publicly enumerable
- preserve evidence integrity

Retention period is TBD and must not be invented.

## Payments

- external PCI-compliant provider
- never store PAN/CVV
- verify webhook signature
- idempotent webhook processing
- store provider reference/status only as needed

## Secrets

Use environment variables/secret manager.

Never commit production secrets or real keys.

## Privacy minimization

Collect only data needed to run the valet operation.

Do not add identity documents, GPS tracking or unrelated profiling without explicit approval.

## Retention

Do not invent legal retention periods.

System design must allow later retention policies for:

- vehicle photos
- customer contact data
- audit history
- payments
- incidents
