import { describe, expect, it } from "vitest";
import manifest from "../package.json";

const forbiddenDependencies = [
  "@valet/ui",
  "expo-location",
  "expo-updates",
  "next",
  "react-dom",
  "react-native-web",
];

describe("Native package contract", () => {
  it("uses Expo Router as the entry point", () => {
    expect(manifest.name).toBe("@valet/valet-native");
    expect(manifest.engines.node).toBe(">=22.13.0");
    expect(manifest.main).toBe("expo-router/entry");
  });

  it("pins the official Expo SDK 57 runtime envelope", () => {
    expect(manifest.dependencies.expo).toBe("~57.0.19");
    expect(manifest.dependencies.react).toBe("19.2.3");
    expect(manifest.dependencies["react-native"]).toBe("0.86.3");
    expect(manifest.dependencies["expo-dev-client"]).toBe("~57.0.18");
  });

  it("uses the MOB-006 portable Employee client boundary", () => {
    expect(manifest.dependencies["@valet/contracts"]).toBe("workspace:*");
    expect(manifest.dependencies["@valet/employee-client"]).toBe("workspace:*");
  });

  it("owns only the accepted SDK-compatible native modules", () => {
    expect(manifest.dependencies["expo-camera"]).toBe("~57.0.4");
    expect(manifest.dependencies["expo-blur"]).toBe("~57.0.2");
    expect(manifest.dependencies["expo-clipboard"]).toBe("~57.0.1");
    expect(manifest.dependencies["expo-application"]).toBe("~57.0.3");
    expect(manifest.dependencies["expo-notifications"]).toBe("~57.0.18");
    expect(manifest.dependencies["expo-network"]).toBe("~57.0.2");
    expect(manifest.dependencies.qrcode).toBe("^1.5.4");
    expect(manifest.dependencies["react-native-svg"]).toBe("15.15.4");
    expect(Object.keys(manifest.dependencies).sort()).toEqual(
      [
        "@expo-google-fonts/plus-jakarta-sans",
        "@expo-google-fonts/space-grotesk",
        "@valet/contracts",
        "@valet/employee-client",
        "expo",
        "expo-application",
        "expo-build-properties",
        "expo-blur",
        "expo-camera",
        "expo-clipboard",
        "expo-constants",
        "expo-dev-client",
        "expo-file-system",
        "expo-font",
        "expo-linking",
        "expo-network",
        "expo-notifications",
        "expo-router",
        "expo-secure-store",
        "expo-status-bar",
        "qrcode",
        "react",
        "react-native",
        "react-native-gesture-handler",
        "react-native-reanimated",
        "react-native-safe-area-context",
        "react-native-screens",
        "react-native-svg",
        "react-native-worklets",
      ].sort(),
    );
  });

  it("pins only the accepted native auth persistence modules", () => {
    expect(manifest.dependencies["expo-secure-store"]).toBe("~57.0.3");
    expect(manifest.dependencies["expo-file-system"]).toBe("~57.0.6");
  });

  it("provides truthful Dev Client and local Android scripts", () => {
    expect(manifest.scripts.dev).toBe(
      "pnpm --filter @valet/contracts build && expo start --dev-client",
    );
    expect(manifest.scripts.start).toBe(
      "pnpm --filter @valet/contracts build && expo start --dev-client",
    );
    expect(manifest.scripts.android).toContain(
      "--native-mode debug --js-mode development --dev-enabled true",
    );
    expect(manifest.scripts["android:release"]).toContain(
      "--native-mode release --js-mode production --dev-enabled false",
    );
  });

  it("does not introduce later-scope or Web-only dependencies", () => {
    for (const dependency of forbiddenDependencies) {
      expect(manifest.dependencies).not.toHaveProperty(dependency);
      expect(manifest.devDependencies).not.toHaveProperty(dependency);
    }
  });
});
