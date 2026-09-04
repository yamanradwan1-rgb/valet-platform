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
