# DEC-072 — Native Staff Authentication Architecture

Status: Accepted
Date: 2026-09-02

Canonical decision log entry: `docs/08_DECISIONS_LOG.md` (DEC-072).

## 1. Context and decision scope

The Employee Web application already uses production-shaped opaque Staff
authentication governed by DEC-023 and DEC-024. Its refresh credential is an
HttpOnly browser cookie protected by an exact-Origin boundary. A native HTTP
client is not a browser, cannot use browser cookie/Origin assumptions as its
security boundary, and must not cause those protections to be weakened.

This decision accepts a separate native login, refresh and logout transport
over the same authoritative `StaffAuthService`, `StaffAuthSession`, User and
refresh-credential lineage. Transport differs; identity, session, credential,
rotation, replay, expiry, revocation and authorization authority do not.

This is a documentation-only architecture decision. It creates no route,
controller, contract, database change, dependency or native implementation.

## 2. Acceptance and governing decisions

This decision is `Accepted`. The project owner supplied the security choices
recorded here, and repository inspection found no material conflict requiring
another owner decision.

The following Accepted Decisions remain binding:

- DEC-023: production Staff authentication, opaque credential formats,
  lifetimes, hashing, rotation, replay-family revocation, browser transport and
  `{ userId }` principal;
- DEC-024: shared durable login anti-abuse;
- DEC-025: production database connection hardening;
- DEC-026 and DEC-027: shared infrastructure and feature ownership;
- DEC-029: controlled Staff provisioning;
- DEC-032: current persisted membership, Location access, role and Shift
  eligibility;
- DEC-063: no generic offline mutation outbox or blind automatic replay;
- DEC-066: Employee identity-generation and transient-state isolation; and
- DEC-071: Expo native platform, secure-storage adapter and Android-first/iOS
  portable architecture.

No device or client fact becomes Staff identity or authorization under this
decision.

## 3. Current Web authentication facts that must remain true

Repository inspection on the decision date establishes this baseline:

| Concern                  | Current authoritative behavior                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login                    | `POST /v1/staff/auth/login`; strict JSON `{ email, password }`; empty query                                                                          |
| Refresh                  | `POST /v1/staff/auth/refresh`; strict empty JSON object; refresh read only from the Staff refresh cookie                                             |
| Logout                   | `POST /v1/staff/auth/logout`; strict empty JSON object; idempotent non-disclosing `204` and cookie clear                                             |
| Access response          | `{ accessToken, tokenType: "Bearer", accessExpiresAt, sessionExpiresAt }`                                                                            |
| Protected transport      | Exactly one `Authorization: Bearer <opaque access token>` header                                                                                     |
| Access lifetime          | At most 15 minutes                                                                                                                                   |
| Refresh lifetime         | Bounded by the non-sliding Staff session absolute expiry of exactly 30 days                                                                          |
| Credential persistence   | Raw credentials are never persisted server-side; separate versioned SHA-256 verifiers are stored                                                     |
| Rotation                 | Refresh rotates both access and refresh credentials under database locks                                                                             |
| Replay                   | Reuse of a consumed refresh credential revokes that session family; concurrent reuse has one rotation winner and the losing reuse revokes the family |
| Cookie                   | `__Secure-vaylet_staff_refresh`; host-only; `Secure`; `HttpOnly`; `SameSite=Strict`; no `Domain`; path `/v1/staff/auth`; bounded `Max-Age`           |
| Browser request boundary | Login, refresh and logout require strict JSON and an exact approved `Origin`                                                                         |
| CORS                     | The current API bootstrap does not globally enable permissive cross-origin CORS                                                                      |
| Principal                | Authentication yields only `{ userId }`; persisted current authorization is resolved separately                                                      |
| Disabled User            | Rejected at login and refresh; access resolution also re-checks current active User state                                                            |
| Logout authority         | A presented refresh credential resolves the session family and revokes it when found; invalid/absent credentials do not disclose session existence   |
| Login anti-abuse         | Shared durable rolling 15-minute limits: five identifier failures and thirty trusted client-address attempts; limiter failure is fail closed         |
| Web client recovery      | Access is memory-only, refresh is single-flight, transient refresh failure is preserved as retryable, and only safe reads are generically retried    |
| Web restoration          | Startup silently attempts cookie refresh; transient failure remains refresh-unavailable, while definitive auth loss clears the session               |
| Safe observability       | Request/exception observers record safe operation, outcome/status, duration, error code and request ID fields rather than authentication bodies      |

The native implementation must add regression tests proving this entire Web
transport remains unchanged. Native response-body refresh semantics must never
be added to these browser routes.

## 4. One authority, two transport boundaries

```text
Employee Web
    |
    | exact-Origin + HttpOnly cookie browser transport
    v
StaffAuthService / StaffAuthSession / StaffRefreshCredential
    ^
    | strict native JSON credential transport over HTTPS
    |
Employee Native
```

MOB-007 must add a thin dedicated native controller/transport boundary that
delegates to the existing Staff authentication service behavior. It must not
create native Users, fork session semantics, duplicate password verification,
or create a second authentication authority.

The accepted exact routes are:

- `POST /v1/staff/auth/native/login`
- `POST /v1/staff/auth/native/refresh`
- `POST /v1/staff/auth/native/logout`

All three routes accept strict JSON, reject unknown fields and non-empty query
parameters, and set responses to prevent authentication response caching. They
do not read or set the Web refresh cookie. Refresh and logout do not accept a
browser cookie as a substitute for their required JSON credential.

The native boundary does not require or forge an approved browser `Origin`.
`Origin`, package name, application version, installation identifier, push
token and device metadata are not native authentication factors. No static
shared secret may be compiled into the distributed application.

This exception is route-local and transport-specific. It does not disable
Origin enforcement on Web auth routes, enable permissive CORS, or change the
browser's cookie/CSRF model.

## 5. Future native request and response contracts

MOB-007 must implement the smallest new transport contracts consistent with
the existing Zod conventions. It must reuse existing field schemas instead of
duplicating domain objects.

### Native login

Request: reuse the exact existing Staff login request fields and validation.

```text
{
  email: string,
  password: string
}
```

Response: reuse the existing Staff access/session response and add exactly one
secret native transport field.

```text
{
  accessToken: opaque Staff access token,
  tokenType: "Bearer",
  accessExpiresAt: timestamp,
  sessionExpiresAt: timestamp,
  refreshToken: opaque Staff refresh credential
}
```

### Native refresh

```text
Request:  { refreshToken: opaque Staff refresh credential }
Response: same exact native login response shape
```

### Native logout

```text
Request:  { refreshToken: opaque Staff refresh credential }
Response: 204 with no body
```

No request or response carries User, membership, Organization, Location, role,
Shift, Task, device or installation authority. The raw `refreshToken` is a
secret field subject to mandatory redaction at every boundary.

Existing safe error conventions remain authoritative. Login preserves current
authentication-failed, anti-abuse and temporary-unavailable behavior. A native
refresh `401` is definitive credential loss. A malformed locally stored
credential rejected by strict request validation is also unusable local auth
state and is purged. Other failures are classified by stable status/error
semantics, never by blanket treatment of every `4xx` or `5xx` as logout.

## 6. Credential handling and secure-storage envelope

### Access credential

The native access token is returned only in an HTTPS response, held only in
process memory and sent through the existing exact Bearer mechanism. It is
never stored in SecureStore, AsyncStorage, SQLite, a file, an offline queue,
URL, query string, navigation state, analytics, telemetry, breadcrumbs, crash
metadata or notification payload.

Process death therefore discards the access token. Cold restoration always
uses the refresh flow and obtains a fresh access token.

### Refresh credential

The native refresh credential is returned and submitted only in strict JSON on
the dedicated native routes over HTTPS. The client holds it durably only behind
the native secure-storage adapter accepted by DEC-071:

- Expo SecureStore backed by Android Keystore-protected platform storage for
  Android; and
- the same portable adapter backed by iOS Keychain semantics when iOS is
  implemented.

It is never stored in ordinary application storage, SQLite, a file, a generic
cache, an offline queue, URL, navigation state, analytics, telemetry,
breadcrumbs, crash metadata or notification payload.

The secure entry is a versioned envelope containing the raw refresh credential
and a non-secret installation-generation value. A matching copy of only that
non-secret generation is held through a narrow app-private installation-state
adapter. The generation is local restore eligibility, is never sent as Staff
proof, and grants no server authority.

On a fresh installation or app-data reset, a missing or mismatched ordinary
installation generation makes any surviving secure entry ineligible. The app
must block restoration, best-effort delete that entry and present login. This
handles iOS Keychain retention across uninstall without device fingerprinting.
Failure to read or establish installation state fails closed; it never causes
silent identity restoration.

## 7. Rotation, replacement and failure taxonomy

The server's DEC-023 rotation and replay behavior is unchanged. There is no
refresh-token reuse grace period.

The client keeps the currently durable refresh credential until the refresh
HTTP outcome is known. After a successful response, it must complete secure
replacement of the old credential before publishing the new access token or
declaring restoration/authentication successful. The adapter must return a
definite success/failure result; a write request merely being issued is not
success.

If the replacement write fails after the response is received:

1. do not publish or retain the new access token as an authenticated session;
2. install a durable local restore block where possible;
3. purge or quarantine the unusable secure entry and all identity state;
4. best-effort revoke the server session using the new refresh credential held
   only in ephemeral memory; and
5. require login.

The old credential must not be retried after the client knows the server
rotated. If durable restore blocking itself cannot be established, the app
enters a fail-closed authentication error state and performs no protected work.

### Transient failure

Network unavailability, timeout, temporary DNS failure, connection loss, HTTP
`5xx` or an explicitly temporary API failure is transient unless an
authoritative credential response was received.

The client must not fabricate authenticated state or falsely claim logout. It
keeps the prior secure refresh entry, holds no restored access token, presents
a truthful restoration-unavailable/retry state, and permits an explicit safe
retry.

### Definitive authentication loss

Expired, revoked, replayed, definitively invalid or malformed refresh state;
revoked `StaffAuthSession`; or disabled/deactivated User is definitive.

The client clears access, installs the restore block, deletes/quarantines the
refresh entry, clears all identity-scoped state and returns to login. A generic
network or `5xx` error is never definitive authentication loss.

### Lost rotated response

If the server commits rotation but the response is lost, the client initially
has only a transient transport result and retains the old secure credential.
On explicit retry, the server remains authoritative:

- if the earlier rotation did not commit, the retry may rotate normally;
- if it did commit, presenting the consumed old credential triggers existing
  replay-family revocation and a definitive auth failure.

The client then purges and requires login. It never resurrects the old token,
recovers a replacement from history, or receives a grace-period bypass.

## 8. Startup, coalescing and protected-request recovery

Startup has an explicit `restoring` state. The app is not operationally
authenticated merely because a secure value exists.

One native process owns at most one in-flight refresh promise for its current
auth generation. Concurrent callers await that result. Completion is ignored
if logout or account change advanced the auth generation while it was in
flight. Distinct server sessions on other processes/devices remain independent.

Protected recovery distinguishes:

1. **Safe read:** a `GET`/`HEAD` may be retried once after one successful
   coalesced refresh.
2. **Known pre-command auth rejection:** when the server definitively rejected
   authentication before domain execution, the feature may offer or make a new
   attempt only under that command's Accepted retry/idempotency contract.
3. **Ambiguous mutation outcome:** timeout or network loss may follow a commit;
   the generic auth layer never replays it. Rehydrate canonical state and use
   the command's existing idempotency, version and explicit retry policy under
   DEC-063.

There is no generic `401/network error -> refresh -> replay every mutation`
mechanism. Authorization failures such as stale Location, Shift, role or Task
ownership are not automatically treated as credential loss.

## 9. Required sequence diagrams

### A. Native login

```text
Employee        Native client       Native auth route      StaffAuthService/DB
   | email/password   |                    |                       |
   |----------------->| HTTPS strict JSON  |                       |
   |                  |------------------->| authenticate + limits|
   |                  |                    |---------------------->|
   |                  |                    |  commit session/creds |
   |                  | access + refresh   |<----------------------|
   |                  |<-------------------|                       |
   |                  | secure refresh write                       |
   |                  |-----> secure adapter                       |
   |                  | success: publish access in memory          |
   | operational UI   |                                            |
   |<-----------------| fetch authoritative context                |
```

No raw credential leaves the service boundary before its database transaction
commits. A secure-write failure follows the fail-closed path in section 7.

### B. Cold-start session restoration

```text
App start -> validate installation generation -> read secure envelope
   |                         |                         |
   |                         | mismatch/missing ------+-> block/delete -> login
   |                         v
   |                    matching refresh
   |                         |
   +-------------------------+-> one native refresh
                                 |-- success -> secure replace
                                 |             -> access in memory
                                 |             -> load server context
                                 |-- transient -> truthful retry state
                                 `-- definitive -> purge -> login
```

### C. Normal refresh rotation

```text
Client secure old R0 -> POST native/refresh {R0}
Server lock + validate session/User/R0 -> consume R0 -> create R1
Server rotate access A0 -> A1 -> commit -> return A1 + R1
Client replace secure R0 with R1 -> only then publish A1 in memory
```

### D. Concurrent refresh coalescing

```text
Request A --\
Request B ---+--> auth generation G: one in-flight refresh --> one result
Request C --/             |                         |
                          +---- all callers await --+

logout/account switch increments G; a late result for old G is discarded.
```

### E. Lost refresh response

```text
Client R0 -> Server commits R0 -> R1 -> response lost
Client sees transient error; R0 remains secure; no access is fabricated
Explicit retry R0 -> server sees consumed credential -> revokes family
Server definitive auth failure -> client blocks/purges -> login required
```

### F. Definitive revocation

```text
Server/User authority: session revoked or User disabled
Client protected call/restore/refresh -> authoritative rejection
Client increments auth generation -> clears access/context/workflows
Client blocks restore -> deletes refresh -> login
```

### G. Logout

```text
Employee logout
   -> advance auth generation and immediately block old-identity work
   -> copy refresh only to ephemeral call scope
   -> persist local restore block
   -> clear access, context, workflows and caches
   -> delete secure refresh (record confirmed/unconfirmed)
   -> best-effort POST native/logout with ephemeral refresh
        |-- 204: server revocation confirmed
        `-- network/server failure: server revocation unconfirmed
   -> discard ephemeral refresh; remain logged out locally
```

### H. Account switch

```text
User A active
  -> complete User A local logout barrier and purge identity state
  -> attempt/record User A server revocation
  -> show login with no User A operational state
  -> authenticate User B
  -> securely persist User B refresh before publishing access
  -> load User B current Organization/Location/role/Shift context
```

## 10. Logout, identity change and reinstall semantics

A native logout request immediately advances the auth generation and prevents
the process from making further requests as the old identity. It then clears
the memory access token, operational context, auth/session generation state,
Task/workflow state, camera/proof state, auth-scoped caches and future
notification identity binding.

The refresh credential is copied only into ephemeral call scope, a durable
restore block is established, secure deletion is attempted, and server logout
is attempted when reachable. An expired access token does not prevent logout
because the refresh credential identifies the session authority. Repeated
logout is safe and non-disclosing.

These outcomes must be represented honestly:

- **Local logout complete:** the old identity is blocked in the process,
  identity state is cleared and a durable restore block prevents reuse.
- **Local secure purge confirmed:** secure deletion returned success.
- **Server revocation confirmed:** the native logout route returned its
  successful non-disclosing response.

The latter two may remain unconfirmed independently. A secure-delete failure
does not re-enable the identity: keep the restore block, retry cleanup safely
and expose no protected application state. If both restore-block persistence
and secure deletion fail, remain in a fatal fail-closed auth state. A server
outage means server revocation is unconfirmed, not that it occurred.

Account switching must use the logout barrier before login for another User.
User B must never inherit User A's Organization/Location, Shift, Task,
workflow, camera/proof, future push binding or cache. If User B's refresh
secure-write fails, User B is not authenticated locally; best-effort revoke the
new session and return to login.

Expo documents that SecureStore data is removed on Android uninstall but may
survive an iOS uninstall/reinstall with the same bundle ID. The installation
generation contract therefore applies on every platform and does not rely on
uninstall behavior. It is not device binding and may only cause a safe local
logout, never grant identity.

## 11. Browser, CORS, CSRF and network boundary

The browser routes retain exact-Origin validation and their Secure, HttpOnly,
SameSite=Strict, host-only refresh cookie. Browser JavaScript never receives
the raw refresh credential. The API must not enable permissive CORS for native;
a native HTTP stack does not need browser CORS permission.

The native routes do not use automatically attached browser credentials, so
browser cookie-CSRF mitigation is not their authentication boundary. A forged
`Origin` supplies no native authority. Conversely, absence of native Origin
checking cannot be copied back to the browser routes.

Production native authentication and protected traffic require HTTPS. The
Android release configuration in MOB-005/MOB-007 must explicitly disallow
cleartext network traffic; any local-development exception must be isolated to
debug configuration and unable to enter a release binary. Certificate pinning
is not required by this decision. Adding it later requires evidence and an
operational certificate/backup-pin rotation and recovery plan.

## 12. Login anti-abuse and credential misuse

Native login uses the same credential validation, Argon2 timing equalization,
disabled-User handling and DEC-024 durable anti-abuse reservations as Web
login. The current exact rolling 15-minute limits remain shared across
transports: five identifier failures and thirty client-address attempts. The
server derives trusted client address under the existing proxy policy. Mobile
UI throttling is usability only and never security authority.

Current refresh/logout do not own a separate durable application limiter.
Native refresh/logout preserve their high-entropy credential lookup,
row-locked rotation, replay-family revocation, expiry/revocation checks and
non-disclosing idempotent logout. This decision adds no speculative durable
scope or schema. Coarse deployment-edge protections may apply consistently,
but must not replace application invariants or log request bodies. CAPTCHA is
not introduced.

A malicious or modified binary can submit network requests and may extract
credentials on a compromised/rooted device. The server therefore trusts only
opaque credentials and current persisted authorization, not client integrity,
package identity, Android ID, Firebase installation ID, advertising ID, IMEI,
push token, app version or installation generation. This architecture reduces
ordinary secret exposure; it does not promise absolute protection on a fully
compromised device.

## 13. Authorization, mutation ordering and database impact

Authentication establishes only the existing `{ userId }` principal. It does
not grant durable membership, Organization, Location, role, LocationAccess,
active Shift, Task ownership or command authority. After restoration, the
client loads authoritative operational context. Every protected read and
mutation re-proves its current server-side authorization.

Operational-context and eligibility reads are snapshots that can become false
between check and use (a TOCTOU boundary). Each consumer transaction must
therefore re-evaluate the complete current Accepted predicate before its later
protected write; restored or cached context never replaces that proof.

The existing authentication mutation ordering remains:

- login reserves server anti-abuse state, locks/validates the current User and
  password, creates the session/refresh verifier transactionally and emits raw
  credentials only after commit;
- refresh resolves the presented verifier, locks credential/session/User,
  validates all current conditions, consumes/inserts/rotates atomically and
  emits replacements only after commit; replay revocation commits without
  returning credentials; and
- logout resolves the presented refresh authority, locks and revokes the
  session transactionally, and remains non-disclosing.

On any database error the relevant authentication transaction rolls back and
returns no newly generated raw credential. For concurrent refresh, both the
winner-commit branch and a winner-rollback branch remain authoritative: a
waiter re-evaluates committed database state after lock acquisition. A timeout
or lost response can leave the client with an unknown commit outcome, which is
handled only through the lost-response policy in section 7.

The current `StaffAuthSession` and `StaffRefreshCredential` schema, unique
verifiers, generation uniqueness, one-unconsumed-credential partial unique
index and User linkage are sufficient. No new model, field, index, runtime
role grant or migration is accepted. In particular, sessions are not labeled
`mobile`, and installation/device metadata is not persisted as auth authority.

## 14. Logging and observability

Raw password, access token, refresh token, Authorization header, Cookie header,
request/response body containing credentials and token hashes are prohibited
from request logs, response logs, exception messages, safe errors, analytics,
telemetry attributes, breadcrumbs, crash reporting, URLs and query strings.
The native client must apply the same prohibition to user-visible debug output.

Future tests must inject recognizable canary credentials and prove their
absence from server and client log/telemetry sinks on success and failure.
Permitted diagnostics are request ID, route template, status, stable failure
category, safe operation name, app/build version and the existing opaque
`StaffAuthSession.id` only where access is already policy-authorized. Even safe
identifiers must not be combined into an unnecessary device fingerprint.

Authentication security telemetry remains separate from tenant `AuditEvent`
history. This decision does not invent new audit events or telemetry schemas.

## 15. Threat model

| #   | Threat                                     | Server defense                                                                             | Client behavior                                                                               | Failure mode                                                                                  | Required test/evidence                                                         |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | Stolen refresh token                       | Opaque 256-bit credential, hash-only persistence, absolute expiry, rotation and revocation | Secure-storage-only handling; never expose through ordinary channels                          | Attacker can act until rotation/revocation; rooted devices are not absolutely protectable     | Rotation/revocation integration tests; physical log/storage inspection         |
| 2   | Refresh replay                             | Consumed-token reuse revokes exactly the affected session family under locks               | Treat authoritative replay rejection as definitive; purge and login                           | Legitimate session is also revoked, by accepted fail-closed design                            | Old-token reuse and concurrent-winner/loser tests                              |
| 3   | Lost rotated response                      | Server keeps rotation/replay semantics; no grace                                           | Initially transient; retain old credential; retry authoritatively; purge on replay/revocation | Retry after committed rotation revokes family and requires login                              | Inject response loss before client storage; verify no grace/resurrection       |
| 4   | Access token stolen from logs              | Central redaction and short lifetime; current User/session checked                         | Memory only; no debug, analytics, URL or crash output                                         | Exposure permits bounded bearer use until expiry/revocation                                   | Canary-secret server/client log tests                                          |
| 5   | Refresh stored outside secure storage      | Contract accepts refresh only on dedicated secret field; no persistence projection         | Secure adapter only; code review rejects ordinary storage/queue/cache                         | Durable theft and unintended backup if violated                                               | Static review plus storage inspection and restart tests                        |
| 6   | Native client fakes Origin                 | Native routes do not trust Origin; server trusts credentials/current state                 | Send no forged browser Origin                                                                 | Origin spoofing grants nothing                                                                | Native route tests with absent/arbitrary Origin; Web exact-Origin tests        |
| 7   | Web auth regression                        | Separate controllers; browser route validation/cookie contract retained                    | Native client never calls cookie routes                                                       | Browser refresh becomes readable or CSRF boundary weakens                                     | Full Web login/refresh/logout cookie/Origin regression suite                   |
| 8   | Concurrent refresh storm                   | Row locks and replay-family defense remain final authority                                 | One in-flight refresh per process/auth generation                                             | Broken coalescing can cause family revocation and login                                       | Multi-request client coalescing test; server concurrent reuse test             |
| 9   | Disabled User with stored credential       | User status checked on refresh and every access resolution; session revoked/fails          | Definitive purge and login                                                                    | Background app discovers disablement only on next server contact                              | Disable after storage, then restore/refresh/access tests                       |
| 10  | Server revocation while backgrounded       | Revoked session rejected on access/refresh                                                 | On foreground rehydrate/refresh; purge on definitive rejection                                | UI may show stale non-authoritative shell until contact, never successful protected authority | Background/revoke/foreground physical and integration proof                    |
| 11  | Identity/account switch                    | Each login has distinct session; server authorizes every request                           | Auth generation barrier and complete User A state purge before User B                         | Stale local presentation or request under wrong identity                                      | Account-switch state/cache/workflow tests                                      |
| 12  | Device/app reinstall                       | Server still requires valid opaque credential and current authorization                    | Installation-generation mismatch blocks surviving Keychain entry                              | Safe extra login; never silent old-identity restoration                                       | Android uninstall/reinstall and future iOS Keychain-retention proof            |
| 13  | Temporary API outage                       | No credential-invalid response is fabricated                                               | Truthful retry state; preserve refresh; no access/auth fabrication                            | Operational unavailability without false logout                                               | DNS/timeout/`5xx` restore tests                                                |
| 14  | Secure-storage corruption                  | Strict token/schema validation rejects malformed input safely                              | Block/purge corrupt envelope and return to login                                              | Safe auth loss                                                                                | Missing, malformed, truncated and version-unknown envelope tests               |
| 15  | Secure-storage write/delete failure        | Server session can be revoked with returned/presented refresh                              | Fail closed, restore block, no access publish; record purge/revocation separately             | Cleanup or server revocation may remain unconfirmed; no old-identity work                     | Inject login/refresh write and logout delete failures                          |
| 16  | Malicious modified mobile binary           | Password/token validation, limits and current authorization are all server-side            | Client integrity is never trusted as authority                                                | Compromised client can use credentials it possesses; no absolute rooted-device guarantee      | API negative tests with arbitrary metadata and direct HTTP client              |
| 17  | Device metadata used as authority          | Server ignores device/package/push/installation facts for authentication/authorization     | Metadata is diagnostics only and minimized                                                    | Metadata spoofing grants nothing                                                              | Contract tests reject/ignore authority fields; authorization tests unchanged   |
| 18  | Stale Location/Shift context after restore | Every protected operation resolves current persisted scope                                 | Fetch fresh operational context; cached context is display-only and identity-scoped           | Read/mutation fails safely; no stale client grant                                             | Change membership/LocationAccess/Shift between sessions, then restore and test |

## 16. Required MOB-007 automated evidence

MOB-007 is not complete without focused contract, service/controller,
integration and native-client tests proving:

### Native login

- valid login returns the accepted native shape and persists only the secure
  refresh envelope;
- invalid credentials, disabled User, malformed/unknown fields and non-empty
  query fail safely without disclosure;
- native and Web login share the exact DEC-024 durable anti-abuse state and
  failure behavior; and
- credentials are absent from logs and URLs on every path.

### Native refresh

- valid refresh rotates access and refresh using the existing session family;
- the old credential is unusable after rotation and replay revokes the family;
- expired credential, revoked session, disabled User and malformed token fail
  definitively;
- simultaneous client requests produce one native refresh request;
- server concurrent reuse retains DEC-023's one-winner/loser-revokes behavior;
- network/timeout/`5xx` retains truthful retryable state and does not falsely
  log out;
- lost-response retry follows authoritative replay/revocation with no grace;
- secure replacement completes before access publication; injected write
  failure fails closed and attempts safe revocation; and
- logout/account change during refresh prevents a late result from restoring
  the old auth generation.

### Native logout and client lifecycle

- reachable logout revokes the current server session and locally purges;
- server-unavailable logout represents local completion and unconfirmed server
  revocation separately;
- repeated logout is safe, expired access does not block it, and delete failure
  leaves a fail-closed restore barrier;
- process kill/restart restores through refresh, never persisted access;
- missing, corrupt, mismatched-generation and unknown-version secure state
  cannot authenticate;
- account switching, logout and definitive loss purge all identity-scoped
  state; and
- restart after logout remains logged out.

### Regression and authorization

- Web login/refresh/logout retain exact Origin, strict JSON and cookie
  properties, and Web response bodies never contain refresh credentials;
- native refresh/logout reject browser-cookie-only attempts and do not set
  cookies;
- tenant, Organization, Location, membership, role, Shift and Task
  authorization behavior is unchanged; and
- safe read retry, known pre-command rejection and ambiguous mutation behavior
  follow section 8 and DEC-063.

## 17. Required MOB-007 physical-device evidence

A physical Android Development Build against a real API must prove:

1. valid and invalid login behavior;
2. no access-token persistence across process death;
3. refresh persistence across process kill;
4. cold restart restoration through real refresh and fresh context loading;
5. network outage during restoration causes truthful retry state, not false
   logout or fabricated authentication;
6. definitive server revocation and disabled User cause purge/login;
7. logout purges locally and reports server revocation confirmation honestly;
8. restart after logout remains logged out;
9. account switch displays no prior identity state;
10. injected/observable SecureStore read, write, corruption and delete failure
    paths are safe;
11. Android uninstall/reinstall cannot silently restore an old identity;
12. no credential appears in user-visible debug output, Android logs, captured
    URLs, analytics/crash test sinks or notification data; and
13. the existing Employee Web login, refresh and logout flow still works
    against the same API deployment.

Testing must cover DEC-071's Android API/device matrix as the program reaches
its pilot gates. Future iOS work must separately prove Keychain-retention and
installation-generation behavior; Android evidence cannot stand in for it.

## 18. Scope exclusions and implementation gate

MOB-002 does not implement native auth, Expo, SecureStore, API routes,
contracts, database changes, migrations, biometrics, passkeys, SSO, magic
links, social login, device enrollment, attestation, permanent device
fingerprinting, push, camera/QR, Firebase, offline queues, Web redesign,
authorization redesign, new Shift semantics, certificate pinning or dependency
installation.

MOB-007 may implement this Accepted architecture only after its own dependency
gates. It must stop rather than change a security-material contract here.

## Decision firewall

All security-material MOB-002 choices are locked in this Accepted decision;
there are no unresolved native-auth semantics delegated to implementation.
MOB-007 may choose internal names and decomposition consistent with current
repository patterns, but not alternate routes, authority, credential channels,
storage, replay, purge, retry or failure behavior. Any material contradiction
discovered later requires a focused owner decision before implementation
continues.

## 19. External platform evidence

- Expo SecureStore storage and uninstall behavior:
  `https://docs.expo.dev/versions/v57.0.0/sdk/securestore/`
- Android Network Security Configuration and cleartext opt-out:
  `https://developer.android.com/privacy-and-security/security-config`
