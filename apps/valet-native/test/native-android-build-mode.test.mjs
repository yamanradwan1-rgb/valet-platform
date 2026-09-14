import { describe, expect, it } from "vitest";

import {
  assertNativeEmbedUsesProductionJs,
  assertNoReleaseDevelopmentOverride,
  NATIVE_ANDROID_BUILD_MODE_ERROR,
  NATIVE_ANDROID_RELEASE_MODE_ERROR,
  resolveNativeAndroidBuildPlan,
} from "../src/build/native-android-build-mode.mjs";

describe("Native Android build-mode guard", () => {
  it("allows native release only with production JS and __DEV__ false", () => {
    expect(
      resolveNativeAndroidBuildPlan({
        devEnabled: false,
        jsMode: "production",
        nativeMode: "release",
      }),
    ).toMatchObject({ nodeEnv: "production", variant: "release" });
  });

  it.each(["debug", "dev-client"])(
    "allows %s with development JS and __DEV__ true",
    (nativeMode) => {
      expect(
        resolveNativeAndroidBuildPlan({
          devEnabled: true,
          jsMode: "development",
          nativeMode,
        }),
      ).toMatchObject({ nodeEnv: "development", variant: "debug" });
    },
  );

  it("rejects release with development JS", () => {
    expect(() =>
      resolveNativeAndroidBuildPlan({
        devEnabled: false,
        jsMode: "development",
        nativeMode: "release",
      }),
    ).toThrow(NATIVE_ANDROID_RELEASE_MODE_ERROR);
  });

  it("rejects release with devEnabled=true", () => {
    expect(() =>
      resolveNativeAndroidBuildPlan({
        devEnabled: true,
        jsMode: "production",
        nativeMode: "release",
      }),
    ).toThrow(NATIVE_ANDROID_RELEASE_MODE_ERROR);
  });

  it.each([
    {},
    { devEnabled: false, jsMode: "production" },
    { devEnabled: false, nativeMode: "release" },
    { jsMode: "production", nativeMode: "release" },
  ])("fails safely when build intent is missing or ambiguous", (input) => {
    expect(() => resolveNativeAndroidBuildPlan(input)).toThrow(
      NATIVE_ANDROID_BUILD_MODE_ERROR,
    );
  });

  it("rejects generated release bundle development overrides", () => {
    const gradle = `
      afterEvaluate {
        tasks.named("createBundleReleaseJsAndAssets").configure {
          devEnabled.set(true)
        }
      }
    `;
    expect(() =>
      assertNoReleaseDevelopmentOverride(gradle, "android/app/build.gradle"),
    ).toThrow(
      `${NATIVE_ANDROID_RELEASE_MODE_ERROR} Remove the development override from android/app/build.gradle before retrying.`,
    );
  });

  it("allows ordinary generated release configuration without a dev override", () => {
    expect(() =>
      assertNoReleaseDevelopmentOverride(
        'bundleCommand = "export:embed"\n// devEnabled.set(true)',
      ),
    ).not.toThrow();
  });

  it("rejects a direct native embed using development JS", () => {
    expect(() =>
      assertNativeEmbedUsesProductionJs({
        argv: ["expo", "export:embed", "--dev", "true"],
        nodeEnv: "development",
      }),
    ).toThrow(NATIVE_ANDROID_RELEASE_MODE_ERROR);
  });

  it("allows production native embed and ordinary development commands", () => {
    expect(() =>
      assertNativeEmbedUsesProductionJs({
        argv: ["expo", "export:embed", "--dev", "false"],
        nodeEnv: "production",
      }),
    ).not.toThrow();
    expect(() =>
      assertNativeEmbedUsesProductionJs({
        argv: ["expo", "start", "--dev-client"],
        nodeEnv: "development",
      }),
    ).not.toThrow();
  });
});
