import { describe, expect, it } from "vitest";
import appConfig from "../app.json";

const expo = appConfig.expo;
const buildProperties = expo.plugins.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === "expo-build-properties",
);
const cameraPlugin = expo.plugins.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === "expo-camera",
);
const notificationsPlugin = expo.plugins.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === "expo-notifications",
);
const splashPlugins = expo.plugins.filter(
  (plugin) => Array.isArray(plugin) && plugin[0] === "expo-splash-screen",
);
const secureStorePlugin = expo.plugins.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === "expo-secure-store",
);

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
          minSdkVersion: 29,
          compileSdkVersion: 36,
          targetSdkVersion: 36,
          usesCleartextTraffic: false,
        },
      },
    ]);
  });

  it("configures SecureStore while keeping release cleartext disabled", () => {
    expect(secureStorePlugin).toEqual([
      "expo-secure-store",
      { configureAndroidBackup: false },
    ]);
    expect(expo.plugins).toContain(
      "./plugins/with-native-push-backup-exclusion",
    );
    expect(buildProperties[1].android.usesCleartextTraffic).toBe(false);
  });

  it("configures one Android operational retrieval notification channel", () => {
    expect(notificationsPlugin).toEqual([
      "expo-notifications",
      {
        icon: "./assets/branding/notification-icon.png",
        defaultChannel: "vaylet-operational-retrieval",
      },
    ]);
  });

  it("configures the production VAYLET launcher and adaptive icons", () => {
    expect(expo.icon).toBe("./assets/branding/app-icon.png");
    expect(expo.android.adaptiveIcon).toEqual({
      foregroundImage: "./assets/branding/adaptive-icon-foreground.png",
      backgroundImage: "./assets/branding/adaptive-icon-background.png",
      monochromeImage: "./assets/branding/monochrome-icon.png",
    });
  });

  it("configures exactly one white, contained VAYLET splash", () => {
    expect(splashPlugins).toEqual([
      [
        "expo-splash-screen",
        {
          backgroundColor: "#FFFFFF",
          image: "./assets/branding/splash-logo.png",
          imageWidth: 200,
          resizeMode: "contain",
        },
      ],
    ]);
  });

  it("keeps camera permission without introducing audio recording", () => {
    expect(cameraPlugin).toEqual([
      "expo-camera",
      {
        cameraPermission:
          "Allow VAYLET Employee to scan resource and handoff QR codes.",
        microphonePermission: false,
        recordAudioAndroid: false,
        barcodeScannerEnabled: true,
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
