# Native development: shared contracts

`@valet/contracts` keeps its Node ESM `.js` source specifiers. Its root and
existing subpath `react-native` exports select compiled `dist/*.js` for
Expo/Metro, before the source `import` condition. This also avoids loading
duplicate source/compiled schemas through subpaths. Types and existing
Node/Web exports are unchanged. Do not rewrite source specifiers or copy
schemas into this app.

From the repository root:

```powershell
corepack pnpm --filter @valet/valet-native start
```

Native `start` and `dev` build contracts before starting Expo. The existing
`corepack pnpm mobile:poc` harness also builds contracts through its API
dependency build before starting Metro. After editing contracts during an
active Metro session, rebuild `@valet/contracts` and reload the app. Restart
Metro after changing package exports.

Guest Access share surfaces additionally require
`EXPO_PUBLIC_CUSTOMER_APP_ORIGIN`. It must be an absolute root-only Customer
application origin with no credentials, query, or fragment. Release builds
require HTTPS; local development permits HTTP only for localhost/loopback.
This is intentionally separate from Employee Web's
`NEXT_PUBLIC_CUSTOMER_APP_ORIGIN`.

## Android bundle resolution proof (no Gradle or APK build)

Run from the repository root. This exercises the real Expo Router Android
dependency graph in development mode without starting an API or using secrets:

```powershell
corepack pnpm --filter @valet/contracts build
$env:EXPO_NO_DOTENV = '1'
$env:EXPO_PUBLIC_API_ORIGIN = 'http://127.0.0.1:3001'
$env:CI = '1'
corepack pnpm --filter @valet/valet-native exec expo export --platform android --dev --no-bytecode --max-workers 2 --output-dir ../../.tmp/mobile-poc/contracts-android-bundle
```

Run these environment overrides in a disposable terminal; the loopback API
value is only for bundling, not for phone connectivity. A successful command
must report `Android Bundled` and write an Android JS bundle. The output is
ignored local evidence, not a deployable APK or physical-device PASS.

No native dependency/plugin/configuration changes are involved. Reload the
existing Development Build against a restarted Metro for physical validation;
an APK rebuild is not required for this resolution repair.

## Android push capability

Staff push uses `expo-notifications` only for the direct native Android device
token, permission, one operational retrieval channel, foreground receipt, and
default-action response capture. The root bootstrap registers the response
listener before auth/shell restoration and also snapshots Expo's startup last
response for terminated/swipe-away launches. Once an initial response is safely
normalized or rejected, its native last-response record is cleared best effort.
It does not use Expo push tokens or the Expo Push Service. The app intentionally
suppresses an OS foreground banner because the existing in-app retrieval alert
is the foreground presentation owner. While backgrounded, the OS owns visible
notification presentation; ordinary delivery starts no background work.

This capability requires a Development Build or other real native binary; Expo
Go is not valid push evidence. A real environment must supply its own
organization-controlled Firebase Android configuration outside this repository.
Without that configuration, token acquisition and remote registration degrade
truthfully while the authenticated Task queue and polling continue to work.

The compact notification status shown at the top of the authenticated workspace
is the smallest existing status surface: it reports permission/registration
availability, offers the OS prompt only while requestable, and otherwise gives
neutral Android-settings guidance. A foreground banner OPEN or accepted OS tap
emits only the allowlisted neutral `TASK_QUEUE` intent. The production auth/shell
gate then restores current identity, revalidates current server-derived context,
fetches the canonical current queue, and only then selects Tasks. Notification
content never routes a URL, supplies Location/Task authority, or invokes a
protected mutation.

This implements ordinary background tap and terminated/swipe-away cold-start
capture. Android Settings **Force stop** is a different platform state: remote
notifications do not resume while the package remains force-stopped and the app
must be manually reopened. Required real Firebase/device lifecycle and lockscreen
evidence remains open; automated lifecycle proof is not a physical PASS.

## Connectivity and lifecycle authority

Production uses the SDK-compatible `expo-network` subscription through a narrow
provider-neutral owner. Its `online`, `offline`, and `unknown` values are device
connectivity hints only: `online` does not prove that the API is reachable, that
authentication is valid, or that any command succeeded. The global no-network
banner is shown only for confirmed `offline`; API and workflow error surfaces
remain authoritative on captive or otherwise unreachable networks.

Foreground and reconnect signals are coalesced into bounded current-authority
reads. They revalidate operational context, the current queue, and at most the
active workflow that already owns a safe server-state read. They never replay a
protected mutation, persist an offline outbox, or claim success after reconnect.
Background/inactive transitions suspend polling and fence sensitive in-flight
workflow presentation until a safe read reconciles it.

Native auth process restart continues to recover only from the installation
generation and SecureStore refresh credential. Access tokens are memory-only.
Logout persists a restore block before best-effort server revocation, and unsafe
durable-storage outcomes remain fail-closed. Android physical evidence for
network switching, lock/unlock, permissions, SecureStore, and process kill
remains an owner-deferred gate; automated simulations are not physical proof.
