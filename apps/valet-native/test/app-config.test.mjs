import { describe, expect, it } from "vitest";
import appConfig from "../app.json";

const expo = appConfig.expo;
const buildProperties = expo.plugins.find(Array.isArray);

describe("Expo application configuration", () => {
  it("uses the accepted Employee identity", () => {
    expect(expo.name).toBe("VAYLET Employee");
    expect(expo.slug).toBe("vaylet-employee");
    expect(expo.android.package).toBe("com.vaylet.employee");
    expect(expo.ios.bundleIdentifier).toBe("com.vaylet.employee");
    expect(expo.platforms).toEqual(["ios", "android"]);
  });

  it("expresses the accepted Android build envelope through CNG", () => {
    expect(buildProperties).toEqual([
      "expo-build-properties",
      {
        android: {
          minSdkVersion: 30,
          compileSdkVersion: 36,
          targetSdkVersion: 36,
          usesCleartextTraffic: false,
        },
      },
    ]);
  });

  it("does not configure OTA, Firebase, EAS, or production credentials", () => {
    expect(expo).not.toHaveProperty("updates");
    expect(expo).not.toHaveProperty("runtimeVersion");
    expect(expo).not.toHaveProperty("owner");
    expect(expo).not.toHaveProperty("extra.eas");
    expect(expo.android).not.toHaveProperty("googleServicesFile");
    expect(expo.ios).not.toHaveProperty("googleServicesFile");
  });
});
