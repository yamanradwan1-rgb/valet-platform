# DEC-071 — Mobile Platform and Repository Architecture

Status: Accepted
Date: 2026-09-01
Amended: 2026-09-04 — Project Owner set the Android product minimum to Android 10 / API 29 and designated Employee Web as the visual reference for Employee Native.

Canonical decision log entry: `docs/08_DECISIONS_LOG.md` (DEC-071).

## 1. Context / problem

VAYLET needs a real native Employee application for operational use on Android,
while preserving a straightforward path to iOS from the same mobile codebase.
The existing `apps/valet` Employee Web application is production-shaped and
must remain available during development and a controlled mobile pilot. It is
not an appropriate source for a WebView wrapper, and its browser-specific UI,
camera, storage, notification and lifecycle mechanisms cannot serve as the
native architecture.

The repository already owns the authoritative API, database, shared contracts,
domain commands, tenant/Location authorization, Shift eligibility, Task and
Dispatch behavior, custody history, secure handoff, financial release guards
and audit history. A mobile migration must reuse those authorities rather than
create a second business system.

This decision records the mobile platform and repository boundary only. It
does not scaffold or implement the application.

## 2. Acceptance status

This decision is `Accepted`. On 2026-09-01, the project owner supplied the
release-envelope values and ownership policies recorded in sections 14–17 and 22. Sections 3–17 therefore form the binding MOB-001 architecture.

Operational account provisioning, credential generation, signing setup and
store configuration remain later release work. Their deferred implementation
does not block this decision or a later MOB-005 scaffold. MOB-001 still creates
no application, package, dependency, credential or runtime configuration.

## 3. Mobile framework and runtime generation

The Employee native application uses React Native through Expo.

The selected generation is:

- Expo SDK 57;
- React Native 0.86, as the React Native generation selected by Expo SDK 57;
- Hermes enabled; and
- React Native New Architecture enabled.

Expo SDK packages must remain mutually compatible with the selected Expo SDK
generation. Later bootstrap work must use Expo-compatible package resolution
rather than independently upgrading React Native or unrelated repository
dependencies.

Official Expo SDK 57 compatibility evidence at the decision date records React
Native 0.86, React 19.2.3 and minimum Node.js 22.13.x:

`https://docs.expo.dev/versions/v57.0.0/`

This decision does not install or pin packages. Exact package and lockfile work
belongs to MOB-005.

## 4. Development and native-capability build model

Development and native-capability testing use Expo Development Builds / real
native binaries.

Expo Go is not the production architecture and is insufficient evidence for:

- native push delivery;
- secure native credential-storage behavior;
- final camera and permission lifecycle;
- application background/terminated behavior;
- native configuration plugins;
- Android release configuration; or
- production signing/distribution behavior.

Expo documents Development Builds as the build model for applications using
their own native libraries/configuration and intended for application stores:

`https://docs.expo.dev/develop/development-builds/introduction/`

Simulator or Expo Go evidence may supplement development, but it cannot replace
physical-device and release-binary proof where a later task requires it.

## 5. Continuous Native Generation

The application uses Expo Continuous Native Generation (CNG).

By default:

- `android/` and `ios/` are generated, short-lived native projects;
- generated native projects are not hand-maintained long-lived Git sources;
- native configuration is expressed through Expo app configuration and
  configuration plugins; and
- unavoidable platform-specific behavior is isolated behind narrow adapters.

Long-lived committed `android/` or `ios/` directories require a later explicit
architecture decision that identifies the concrete need, ownership, upgrade
burden and cross-platform consequence. An implementation task may not silently
change this policy because a native file is convenient to edit.

Expo's CNG model generates native projects from a standard template plus
maintained configuration/customization definitions:

`https://docs.expo.dev/workflow/continuous-native-generation/`

## 6. Routing

The native application uses Expo Router.

Routing is a presentation/navigation concern. Route presence, route parameters,
deep links and future notification taps do not authenticate an actor, grant
Organization or Location access, prove an active Shift, assign or accept a
Task, authorize a session transition, verify handoff, or permit vehicle
release. Every protected read or mutation continues through its existing
server-authoritative boundary.

## 7. Repository placement

The Employee native application belongs at:

```text
apps/valet-native
```

It is a sibling of:

```text
apps/valet
```

inside the existing pnpm workspace and Turborepo monorepo. It is not a second
repository and does not fork the backend, database or contracts.

MOB-001 creates no application folder. Repository/workspace/Turbo changes are
deferred to MOB-005.

## 8. Android-first delivery

Android is the first implementation, physical-device QA and controlled pilot
platform.

For Expo SDK 57, Android `compileSdkVersion` and `targetSdkVersion` are both API 36. VAYLET therefore uses compile/target API 36 for this generation. This is a
build target, not the minimum supported device OS.

The selected API level is also consistent with the Google Play submission
requirement effective 2026-08-31:

`https://developer.android.com/google/play/requirements/target-sdk`

Android-first does not permit Android-only business/client workflow logic.
Kotlin or Java may contain only technically unavoidable, narrowly isolated
platform integration approved by the relevant later task. Server/domain rules
must not migrate into Android code.

The commercially supported product minimum is Android 10 / API 29. The initial
device/OS validation policy is binding as recorded in section 15. Expo's wider
technical support does not lower this product floor.

## 9. iOS from day one

The same Expo application is intended to produce the later iOS Employee
application. It is not a future rewrite.

The following remain shared and platform-neutral where implementation proves
real reuse:

- API contracts and validation;
- business/client workflow orchestration;
- authentication/session semantics;
- error and recovery semantics;
- navigation model and route intent;
- localization and formatting;
- design tokens;
- scanner payload/session semantics; and
- notification semantics.

Platform-specific camera, secure storage, push, permissions, application
lifecycle, screen privacy and signing behavior stay behind narrow adapters.
Public domain contracts, database concepts and portable package APIs must not
use Android- or FCM-specific naming for concepts that also serve iOS/APNs.

An iOS configuration/build smoke is required before final Android pilot
completion, although full physical-device implementation and QA remain
Android-first.

## 10. Employee Web visual reference, fallback and cutover boundary

The existing Employee Web application remains available during native
development and the controlled Android pilot.

- MOB-001 does not delete, deprecate, freeze or refactor `apps/valet`.
- The native application does not embed or wrap Employee Web in a WebView.
- Mobile becoming the primary Employee terminal is a later evidence-based
  owner decision after physical pilot evidence.
- Employee Web retirement or long-term fallback status is a separate later
  owner decision.

Canonical server state permits Web and native clients to coexist without a
client-to-client data migration.

The existing Employee Web application is the visual source of truth for the
production Employee Native application. Native must preserve, as closely as
practical, the existing VAYLET visual identity, color system, typography
hierarchy, card and button appearance and emphasis, spacing rhythm, border
radius conventions, visual grouping, information hierarchy, applicable icon
language, loading/empty/error/success state language, form-field treatment,
operational status presentation, EN/AR consistency, RTL/LTR behavior, and
interaction wording and action hierarchy.

This is adaptation, not redesign. Native may deviate only where required by
mobile ergonomics, smaller screens, touch interaction, safe areas, native
navigation conventions, Android/iOS behavior, accessibility, keyboard
behavior, camera/scanner presentation, performance, or technical platform
limitations. Every deviation must retain the same product identity and
information hierarchy.

Native UI remains platform-specific. It must not reuse Web DOM components,
mechanically copy CSS, embed Employee Web in a WebView, force desktop layouts
onto mobile, introduce a Native-only design language without Project Owner
approval, or redesign an existing Employee flow merely because Native is a new
client.

## 11. Portable shared-code boundary

Shareable Employee business/client workflow logic should later live behind a
portable pure-TypeScript boundary, provisionally as a focused package such as:

```text
packages/employee-client
```

The final package name and extraction are owned by MOB-006. MOB-001 does not
create or refactor that package.

Portable code must not depend on:

- DOM or browser globals such as `window`, `document` or `navigator`;
- cookies, local browser storage, MediaStream or React DOM;
- Next.js;
- Node-only APIs;
- React Native;
- Android APIs; or
- iOS APIs.

Web and native UI remain platform-specific. Visual/behavioral parity does not
require sharing DOM/CSS/React Native components. New abstractions require
evidence of actual reuse; theoretical future reuse is not sufficient.

## 12. Existing backend authority

The existing API, database, shared contracts and server domain/application
logic remain authoritative. No backend rewrite is required for the mobile
migration.

Mobile cannot become an alternate authority for:

- User or membership identity;
- Organization or Location scope;
- role or LocationAccess;
- Shift eligibility;
- Task assignment/ownership/version;
- ValetSession state;
- parking/key custody;
- retrieval or handoff;
- financial release guards; or
- audit history.

Native Staff authentication transport is deferred to MOB-002/MOB-007. Native
push architecture and persistence are deferred to MOB-003 and later push
implementation tasks. Neither is inferred by this platform decision.

## 13. Offline and server-authoritative behavior

The native architecture does not introduce a generic durable offline
synchronization system, persistent mutation outbox, full local database,
automatic background mutation replay or fabricated local command success.

DEC-063 remains fully binding. Protected operations retain their accepted
`ONLINE_ONLY`, `REHYDRATE_BEFORE_RETRY` or
`MANUAL_RETRY_EXISTING_IDEMPOTENCY` classification unless a later Accepted
Decision explicitly changes one operation.

## 14. Application and bundle identifiers

The accepted Android application/package ID is:

```text
com.vaylet.employee
```

The accepted iOS bundle ID is:

```text
com.vaylet.employee
```

The identifier is production-stable and permanent. Environment-specific
production package IDs must not be introduced unless a later Accepted release
decision explicitly requires them.

Android and iOS are the same VAYLET Employee product. Platform-specific
technical configuration may differ, but product identity and mobile
architecture remain shared.

## 15. Supported Android floor and device matrix

Expo SDK 57 technically supports Android 7+, but that broad framework floor is
not automatically VAYLET's commercial support promise.

The accepted product and validation policy is:

- minimum supported Android 10 / API 29;
- compile and target Android API 36;
- validation coverage for Android 10, Android 11, Android 13, Android 15 and
  Android 16;
- device-family coverage for Samsung, Pixel/reference Android behavior and
  representative mid-range physical Android hardware; and
- at least one real Samsung/mid-range-class device in physical pilot testing.

Exact commercial device models are recorded later against the deployed pilot
fleet rather than permanently hard-coded here. Emulators may supplement the
matrix, but they do not replace physical-device proof for camera, QR,
application lifecycle, permissions, notifications, SecureStore or
production-build behavior.

## 16. Store, provider and signing ownership

Production mobile accounts and credentials are organization-controlled and
must not depend permanently on a contributor's personal account.

Google Play policy:

- the application uses an organization-controlled developer account;
- release ownership has an accountable primary owner, an
  organization-controlled recovery path and least-privilege access; and
- the recovery procedure is documented before production release.

Firebase policy:

- Firebase uses an organization-controlled project with an accountable primary
  owner, organization-controlled recovery access and least-privilege
  credentials;
- environment separation follows the later Accepted release design; and
- Firebase service credentials must not be embedded in the mobile application
  or repository.

Android production signing/upload policy:

- credentials are organization-controlled;
- no credential is committed to Git or embedded in application source;
- custody has a primary owner, an independent recovery path and a documented
  custody/recovery procedure; and
- CI/release access follows least privilege.

Future iOS distribution uses an organization-controlled Apple Developer team
and must not depend permanently on one developer's personal Apple account.

Actual Google Play and Firebase provisioning, signing-key generation and
configuration, and Apple bundle/signing/provisioning implementation remain
their later push, iOS or release tasks. They do not block application
scaffolding.

## 17. OTA update policy

Expo Updates / OTA delivery is disabled for the initial Android pilot. Pilot
releases use deterministic native binaries with bundled JavaScript.

OTA may be evaluated only through a later focused Accepted Decision defining:

- Expo `runtimeVersion` compatibility;
- rollout and rollback;
- channel/environment separation;
- native/JavaScript compatibility; and
- an emergency disable procedure.

OTA must never bridge incompatible native code or bypass release approval.

## 18. Consequences and tradeoffs

Benefits:

- high safe reuse of existing TypeScript contracts and client orchestration;
- one mobile application architecture for Android and iOS;
- production native camera, secure-storage, push and lifecycle capability;
- lower native-project maintenance through CNG;
- existing server authority and Employee Web fallback remain intact; and
- no new backend or infrastructure architecture is implied.

Tradeoffs:

- React Native UI must be implemented separately from DOM/CSS UI;
- native binaries and physical-device testing are required earlier;
- Expo SDK upgrades must follow compatible React Native generations;
- platform permission/background behavior still requires Android and iOS
  validation; and
- unusual native requirements may later need a narrowly justified config
  plugin/adapter or an explicit revision to the generated-directory policy.

## 19. Explicitly deferred

This decision does not authorize or implement:

- Native Staff authentication transport — MOB-002;
- Native push architecture — MOB-003;
- architecture-gate or portable-import enforcement — MOB-004;
- Expo application scaffold — MOB-005;
- portable Employee client extraction — MOB-006;
- Native Staff authentication implementation — MOB-007;
- Task-scoped GPS inclusion/permission/sampling policy — later explicit
  decision;
- condition-photo byte upload or object-storage expansion — separate scope if
  required;
- signing, store submission or distribution implementation — later release
  task;
- Expo package installation or lockfile changes;
- Employee Web refactoring/deletion;
- native runtime code;
- database/schema/migration changes; or
- application lifecycle, Task, Dispatch, ValetSession or authorization changes.

## 20. Domain, security and persistence impact

MOB-001 affects no persisted entity and no ValetSession or Task/Dispatch
transition. It introduces no route, role, permission, authorization decision,
tenant/Location behavior, database constraint/index, migration, configuration
policy, audit event, dependency or runtime code.

The backend remains canonical and every later protected operation must preserve
the repository's authorization-before-mutation order and append-only evidence
rules.

## 21. Acceptance resolution

The project owner supplied or selected every release-envelope value required
for acceptance:

1. exact stable Android and iOS identifiers;
2. the Android product floor, compile/target level and validation matrix;
3. organization-control, accountable ownership, recovery and least-privilege
   policies for Google Play, Firebase, Android signing and Apple distribution;
4. an initial OTA-disabled pilot policy;
5. continued Employee Web operation through the evidence-based cutover gate;
6. Employee Web as the visual source of truth for production Employee Native
   UI, with platform-specific adaptation rather than redesign; and
7. synchronization of the canonical decisions log, technology stack and
   repository structure in this documentation task.

No credential, account identifier, signing material or secret is recorded in
this decision. Operational provisioning and named assignments remain later
release evidence and do not reopen the architecture decision.

## 22. Owner decisions recorded

| Boundary                       | Accepted decision                                                                                                                                                                                     | Follow-on timing                                                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Android application/package ID | `com.vaylet.employee`; production-stable and permanent                                                                                                                                                | Environment-specific production IDs require a later Accepted release decision                                           |
| iOS bundle ID                  | `com.vaylet.employee`; same VAYLET Employee product identity and shared architecture                                                                                                                  | Platform-specific configuration may differ during iOS implementation                                                    |
| Android support                | Minimum Android 10 / API 29; compile/target API 36                                                                                                                                                    | Owner-approved product floor; further changes require an Accepted owner amendment                                       |
| Android validation             | Android 10, 11, 13, 15 and 16; Samsung, Pixel/reference behavior and representative mid-range physical hardware                                                                                       | Record exact deployed models in the pilot/release task; emulators supplement but do not replace required physical proof |
| Google Play                    | Organization-controlled developer account, accountable primary owner, organization-controlled recovery, least privilege and documented pre-production recovery                                        | Provision during release operations; not a scaffold blocker                                                             |
| Firebase                       | Organization-controlled project, accountable primary owner, organization-controlled recovery, least privilege, later-approved environment separation and no service credentials in the app/repository | Provision during native-push/release work; not a current blocker                                                        |
| Android signing/upload         | Organization-controlled custody, no Git/source secrets, primary owner, independent recovery, documented custody/recovery and least-privilege CI/release access                                        | Generate and configure during release work                                                                              |
| Apple distribution             | Organization-controlled Apple Developer team; no permanent dependency on one developer's personal account                                                                                             | Implement bundle signing/provisioning during iOS/release work                                                           |
| Initial OTA                    | Disabled for the initial Android pilot; deterministic native binaries with bundled JavaScript                                                                                                         | Reconsider only through a focused Accepted Decision with the controls in section 17                                     |
| Employee Web fallback          | Remains operational during native development and the controlled Android pilot; native-primary cutover is evidence-gated                                                                              | Web retirement is a separate later decision                                                                             |
| Employee Native visual reference | Employee Web is the visual source of truth; Native preserves its product identity and hierarchy through platform-specific adaptation rather than redesign                                             | Applies from MOB-010; MOB-018 is the cross-flow visual/localization/accessibility closure                               |
