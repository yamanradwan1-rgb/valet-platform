# Config Package

Shared TypeScript/lint/build configuration and validated environment configuration.

Web Push is disabled by default. When explicitly enabled, server configuration
requires structurally valid VAPID public/private keys and subject plus an
active 32-byte subscription-storage encryption key and version. One optional
previous key/version may be retained only for a bounded rotation window.
The separate stable endpoint-fingerprint HMAC key prevents endpoint recovery
and must remain available while retained tombstones participate in duplicate
detection. Encryption always uses the active key; previous keys are
decrypt-only until records are re-encrypted or disabled and resubscribed.
There is no plaintext fallback and no production key is committed here.
T1 validates the structural uncompressed P-256 public-key and 32-byte private-
key shapes only; T3 must use the selected sender library to validate the VAPID
pair before any remote delivery is enabled.
