export const NATIVE_ANDROID_BUILD_MODE_ERROR =
  "Native Android build mode is ambiguous. Provide an explicit native mode, JS mode, and devEnabled value.";

export const NATIVE_ANDROID_RELEASE_MODE_ERROR =
  "Refusing native release build with development JS enabled. Release artifacts must use production JS (__DEV__ = false).";

const nativeModes = new Set(["debug", "dev-client", "release"]);
const jsModes = new Set(["development", "production"]);

export function resolveNativeAndroidBuildPlan(input) {
  if (
    !nativeModes.has(input?.nativeMode) ||
    !jsModes.has(input?.jsMode) ||
    typeof input?.devEnabled !== "boolean"
  ) {
    throw new Error(NATIVE_ANDROID_BUILD_MODE_ERROR);
  }

  const isRelease = input.nativeMode === "release";
  const isDevelopmentJs =
    input.jsMode === "development" || input.devEnabled === true;
  if (isRelease && isDevelopmentJs) {
    throw new Error(NATIVE_ANDROID_RELEASE_MODE_ERROR);
  }
  if (!isRelease && !isDevelopmentJs) {
    throw new Error(
      "Refusing a Native development build without development JS (__DEV__ = true).",
    );
  }
  if ((input.jsMode === "development") !== (input.devEnabled === true)) {
    throw new Error(
      "Native JS mode and devEnabled disagree; use development/true or production/false.",
    );
  }

  return {
    devEnabled: input.devEnabled,
    jsMode: input.jsMode,
    nativeMode: input.nativeMode,
    nodeEnv: input.jsMode,
    variant: isRelease ? "release" : "debug",
  };
}

export function assertNoReleaseDevelopmentOverride(
  gradleSource,
  sourceName = "android/app/build.gradle",
) {
  const executableSource = gradleSource
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const developmentOverrides = [
    /devEnabled\s*\.\s*set\s*\(\s*true\s*\)/,
    /devEnabled\s*=\s*true/,
    /["']--dev(?:=|["']\s*,\s*["'])true/,
  ];
  if (developmentOverrides.some((pattern) => pattern.test(executableSource))) {
    throw new Error(
      `${NATIVE_ANDROID_RELEASE_MODE_ERROR} Remove the development override from ${sourceName} before retrying.`,
    );
  }
}

export function assertNativeEmbedUsesProductionJs({ argv, nodeEnv }) {
  if (!argv.includes("export:embed")) return;

  const hasDevelopmentFlag = argv.some(
    (argument, index) =>
      argument === "--dev=true" ||
      (argument === "--dev" && argv[index + 1] !== "false"),
  );
  if (nodeEnv !== "production" || hasDevelopmentFlag) {
    throw new Error(NATIVE_ANDROID_RELEASE_MODE_ERROR);
  }
}
