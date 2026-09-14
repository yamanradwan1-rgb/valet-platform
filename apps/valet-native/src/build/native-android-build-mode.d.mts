export interface NativeAndroidBuildModeInput {
  readonly devEnabled?: boolean;
  readonly jsMode?: string;
  readonly nativeMode?: string;
}

export interface NativeAndroidBuildPlan {
  readonly devEnabled: boolean;
  readonly jsMode: "development" | "production";
  readonly nativeMode: "debug" | "dev-client" | "release";
  readonly nodeEnv: "development" | "production";
  readonly variant: "debug" | "release";
}

export const NATIVE_ANDROID_BUILD_MODE_ERROR: string;
export const NATIVE_ANDROID_RELEASE_MODE_ERROR: string;

export function resolveNativeAndroidBuildPlan(
  input: NativeAndroidBuildModeInput,
): NativeAndroidBuildPlan;

export function assertNoReleaseDevelopmentOverride(
  gradleSource: string,
  sourceName?: string,
): void;

export function assertNativeEmbedUsesProductionJs(input: {
  readonly argv: readonly string[];
  readonly nodeEnv: string | undefined;
}): void;
