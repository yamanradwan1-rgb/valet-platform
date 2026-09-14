import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { env, execPath, exit } from "node:process";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

import {
  assertNoReleaseDevelopmentOverride,
  resolveNativeAndroidBuildPlan,
} from "../src/build/native-android-build-mode.mjs";

const { values } = parseArgs({
  allowPositionals: false,
  options: {
    "dev-enabled": { type: "string" },
    "js-mode": { type: "string" },
    "native-mode": { type: "string" },
  },
  strict: true,
});

const plan = resolveNativeAndroidBuildPlan({
  devEnabled:
    values["dev-enabled"] === "true"
      ? true
      : values["dev-enabled"] === "false"
        ? false
        : undefined,
  jsMode: values["js-mode"],
  nativeMode: values["native-mode"],
});
const nativeRoot = resolve(import.meta.dirname, "..");
const androidBuildFile = resolve(nativeRoot, "android", "app", "build.gradle");

if (plan.nativeMode === "release" && existsSync(androidBuildFile)) {
  assertNoReleaseDevelopmentOverride(
    readFileSync(androidBuildFile, "utf8"),
    androidBuildFile,
  );
}

const expoCli = resolve(nativeRoot, "node_modules", "expo", "bin", "cli");
if (!existsSync(expoCli)) {
  throw new Error("The workspace Expo CLI is unavailable; run pnpm install.");
}

const result = spawnSync(
  execPath,
  [expoCli, "run:android", "--variant", plan.variant],
  {
    cwd: nativeRoot,
    env: {
      ...env,
      BABEL_ENV: plan.nodeEnv,
      NODE_ENV: plan.nodeEnv,
      VAYLET_NATIVE_BUILD_MODE: plan.nativeMode,
      VAYLET_NATIVE_DEV_ENABLED: String(plan.devEnabled),
      VAYLET_NATIVE_JS_MODE: plan.jsMode,
    },
    stdio: "inherit",
  },
);

if (result.error) throw result.error;
exit(result.status ?? 1);
