import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { getNativeQrCopy } from "../src/scanner/native-qr-copy";
import appConfig from "../app.json";
import manifest from "../package.json";

vi.mock("expo-camera", () => ({
  Camera: {
    getCameraPermissionsAsync: vi.fn(),
    requestCameraPermissionsAsync: vi.fn(),
  },
}));
const { nativeQrCameraSettings } =
  await import("../src/scanner/native-camera-adapter");
const read = (path) => readFileSync(resolve(import.meta.dirname, path), "utf8");

describe("MOB-009 native capture wiring", () => {
  it("selects rear camera, QR-only and muted capture", () => {
    expect(nativeQrCameraSettings).toEqual({
      facing: "back",
      barcodeScannerSettings: { barcodeTypes: ["qr"] },
      mute: true,
    });
  });
  it("uses installed Expo's compatible camera version", () => {
    const recommended = JSON.parse(
      read("../node_modules/expo/bundledNativeModules.json"),
    );
    expect(manifest.dependencies["expo-camera"]).toBe(
      recommended["expo-camera"],
    );
  });
  it("configures native barcode support and explicitly disables audio permission", () => {
    expect(
      appConfig.expo.plugins.find((plugin) => plugin[0] === "expo-camera"),
    ).toEqual([
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
  it.each(["en", "ar"])(
    "provides %s copy for every capture state and manual fallback",
    (locale) => {
      const copy = getNativeQrCopy(locale);
      expect(Object.keys(copy.phases)).toHaveLength(8);
      expect(
        Object.values(copy.phases).every((value) => value.length > 10),
      ).toBe(true);
      expect(copy.manualHint.length).toBeGreaterThan(20);
      expect(copy.disclaimer).not.toContain("vhq1.");
      expect(Object.keys(copy.kinds)).toEqual(["key-slot", "parking-spot"]);
    },
  );
  it("Arabic copy is genuinely localized", () => {
    expect(getNativeQrCopy("ar").title).toBe("المسح");
    expect(getNativeQrCopy("en").title).toBe("Scan");
  });
  it("wires CameraView only for starting/scanning, with generation-bound callbacks", () => {
    const source = read("../src/scanner/native-qr-panel.tsx");
    expect(source).toContain(
      'snapshot.phase === "starting" || snapshot.phase === "scanning"',
    );
    expect(source).toContain("{mounted ? (");
    expect(source).toContain("controller.barcode(generation, event)");
    expect(source).toContain("controller.ready(generation)");
    expect(source).toContain("controller.fail(generation)");
    expect(source).toContain("onRequestClose={exit}");
    expect(source).toContain("useFocusEffect");
    expect(source).toContain("bindNativeQrLifecycle");
  });
  it("keeps resource fields editable, codes LTR-isolated, and controls accessible", () => {
    const source = read("../src/scanner/native-qr-panel.tsx");
    expect(source).toContain('writingDirection: "ltr"');
    expect(source).toContain('locale === "ar" ? "rtl" : "ltr"');
    expect(source).toContain("controller.manual(value)");
    expect(source).not.toContain("editable={false}");
    expect(source).toContain("accessibilityLabel={copy.manual}");
    expect(source).toContain("accessibilityState=");
    expect(source).toContain('accessibilityLiveRegion="polite"');
    expect(source).toContain("key={snapshot.rejectionCount}");
    expect(read("../src/foundation/foundation-styles.ts")).toContain(
      "minHeight: employeeButtonHeights.large",
    );
  });
  it("exposes exactly the two resource modes and no Dynamic handoff tab", () => {
    const source = read("../src/scanner/native-qr-panel.tsx");
    expect(source).toContain('["key-slot", "parking-spot"]');
    expect(source).not.toContain('"dynamic-handoff"');
    expect(getNativeQrCopy("en").kinds).toEqual({
      "key-slot": "Key Slot",
      "parking-spot": "Parking Spot",
    });
  });
  it("contains no scanner persistence, network, proof rendering, or recording surface", () => {
    for (const file of [
      "native-qr-controller.ts",
      "native-camera-adapter.ts",
      "native-qr-panel.tsx",
    ]) {
      const source = read(`../src/scanner/${file}`);
      for (const forbidden of [
        "console.",
        "SecureStore",
        "FileSystem",
        "AsyncStorage",
        "fetch(",
        "router.push",
        "recordAsync",
        "takePictureAsync",
        "input.proof",
      ]) {
        expect(source).not.toContain(forbidden);
      }
    }
  });
  it("gates the Scan panel by authenticated identity generation", () => {
    const shell = read("../src/foundation/foundation-shell.tsx");
    expect(shell).toContain("key={snapshot.authGeneration}");
    expect(shell).toContain('snapshot.phase === "authenticated"');
  });
});
