# Automatic WhatsApp Guest Access — Prime Final QA Remediation

## Authority and review boundaries

Baseline 1ecdbeff1c4b7b011a1af00c843f7930e515cea4.
Original review candidate 6b1810d38456495f3c42783f266af82a4c72cf1d.
DEC-105 authorizes only a disabled/mocked, narrow encrypted outbox.
The independent W7 replacement worked in a separate read-only checkout and
committed docs/validation/whatsapp/W7_INDEPENDENT_SECURITY_ACCEPTANCE.md
at 6f25ddd16baf17a76d2383d7f5a761b2010769cb. Original W7 never ran.
The independent original-SHA verdict was FIX REQUIRED, not GO.

## Independent W7 findings and remediation ownership

| Finding | Level | Independent regression | Owner |
|---|---|---|---|
| W7-P1-01 | P1 | PostgreSQL runtime INSERT forges enabled Meta sender verification | W1: forward-only 090, restricted column INSERT and 42501 negative |
| W7-P1-02 | P1 | Padded Base64 wamid wrongly UNKNOWN and webhook 400 | W3 provider + Prime W5 parser; positive/invalid-padding tests |
| W7-F33 | P2 | Customer phone change leaves PENDING encrypted envelope and due claim | W1/W4: early durable suppression/purge, race proof |
| W7-F11 | P2 | Signed DELIVERED then sender crash wrongly becomes UNKNOWN | W1: forward-only 091 authenticated-event-aware recovery |
| W7-K01 | P2 | Issuer accepts private RSA key as a public PEM input | W2: reject private PEM, retain RSA3072 public sealer |

W7 independently reproduced the first, third and fourth in isolated real
PostgreSQL 17, the second via real TypeScript functions and the fifth via
synthetic RSA key input. Initial 89-migration SQL smoke, focused 88/88 API
unit and 3/3 UI freeze tests passed but did not disprove these negatives.
W7 must independently retest every fix on the exact final cumulative SHA
before an independent acceptance verdict can be issued.

## Baseline differential evidence

Pinned baseline and feature use Windows, Node v24.19.0, pnpm 10.34.5 and
frozen workspace lockfiles. The baseline detached checkout installed offline.

| Gate | Pinned main | Feature checkpoint | Attribution |
|---|---|---|---|
| Lint | FAIL 13 Dashboard diagnostics: 10 errors, 3 warnings | Same failures | PREEXISTING reproduced |
| Typecheck | FAIL Employee Web staff-operational-context timezone fixtures | Same failures | PREEXISTING reproduced |
| Architecture check | PASS with existing grandfathered oversized files | PASS | No feature regression at checkpoint |
| Build | PASS 10/10 tasks | PASS 10/10 tasks at original feature SHA | Prior source evidence, final SHA needs rerun |
| Non-Postgres | Controlled baseline full run pending | Original checkpoint 3 timeouts in 889 tests; isolated relevant tests 54/54 PASS | UNRESOLVED under full-suite resource contention |
| Full PostgreSQL | Baseline run pending | Official protected test target now restored; source candidate suite in progress | Exact root result pending |

## Protected PostgreSQL environment recovery

The protected Issue #215 root harness correctly rejected an unverified DB.
Docker Desktop engine was started and the repository-owned Worker9 PostgreSQL
17 disposable fixture was created with verified pinned postgres:17-alpine
image identity, per-run issue/owner labels, dynamic loopback port and tmpfs
storage. The fixture's local runtime manifest provides task-only credentials
and test-run identity. NODE_ENV=test and the exact Worker9 manifest fields
are required for bootstrap. The official worker9 fixture checks ownership,
image, port, labels and database principal, and is stopped and removed by
the harness wrapper even on test failure. No application or production
database was used. Initial full Postgres run has shown a guest-t3-cost
query-plan failure; attribution requires a matching baseline/isolated rerun.
W1 restricted binding INSERT candidate independently passed 90 pristine
forward-only migrations, least privilege and denied-forgery 42501 negatives.

## Frozen scope and external gates

The original 2,174-path protected UI baseline manifest must remain unchanged.
Zero Native, Employee Web, Customer Web, unrelated Dashboard, navigation,
translations, shared design or snapshot edits are authorized. The original
WhatsApp Dashboard settings carve-out remains unchanged.

Real sending and issuance remain disabled. No real Meta delivery or consent
was fabricated. External gates remain: actual recipient opt-in/withdrawal
governance; Meta company onboarding; AR/EN approved templates; tested
fragment compatibility; key custody, backups, retention and restore; physical
Native device; explicit production migration/deployment and main merge
authorization. This QA task authorizes none of those external actions.

Final verdict and final source SHA must be updated with exact cumulative
test results and W7 independent retest; this preliminary document is not GO.
