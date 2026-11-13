import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { Text } from "react-native";

const appearance = vi.hoisted(() => ({ mode: "light" as "light" | "dark" }));
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Pressable: "Pressable",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  View: "View",
}));
vi.mock("../src/appearance/employee-appearance-context", async () => {
  const { employeePalettes } =
    await import("../src/appearance/employee-palette");
  return {
    useEmployeePalette: () => employeePalettes[appearance.mode],
    useEmployeeStyles: <T,>(styles: { light: T; dark: T }) =>
      styles[appearance.mode],
  };
});

const { NativeCheckInParkingTaskStep } =
  await import("../src/check-in/native-check-in-parking-task-step");
const { getNativeCheckInCopy } =
  await import("../src/check-in/native-check-in-copy");
const { whatsAppPrototypeSnapshot } =
  await import("../src/prototypes/whatsapp/native-whatsapp-prototype-fixture");
const { appearanceNodes, resolveAppearanceTree } =
  await import("./appearance-render-tree");
const baselineFile = new URL(
  "./fixtures/issue-310-parking-task-baseline.json",
  import.meta.url,
);

function render(locale: "en" | "ar") {
  return resolveAppearanceTree(
    NativeCheckInParkingTaskStep({
      copy: getNativeCheckInCopy(locale),
      error: false,
      locale,
      onOpenGuestAccess: () => {},
      onStart: () => {},
      snapshot: whatsAppPrototypeSnapshot,
      starting: false,
      textAlign: locale === "ar" ? "right" : "left",
    }),
  );
}

function currentMatrix() {
  return Object.fromEntries(
    (["light", "dark"] as const).flatMap((mode) => {
      appearance.mode = mode;
      return (["en", "ar"] as const).map((locale) => [
        `${mode}-${locale}`,
        render(locale),
      ]);
    }),
  );
}

describe("Issue #310 original Parking Task presentation", () => {
  it("retains the pre-prototype tree and styles in both themes and locales", () => {
    expect(currentMatrix()).toEqual(
      JSON.parse(readFileSync(baselineFile, "utf8")),
    );
  });

  it("inserts only the explicit development fixture after Guest Access", () => {
    vi.stubGlobal("__DEV__", true);
    const original = render("en");
    const slot = <Text testID="whatsapp-prototype-marker">Demo only</Text>;
    const tree = resolveAppearanceTree(
      NativeCheckInParkingTaskStep({
        copy: getNativeCheckInCopy("en"),
        error: false,
        locale: "en",
        onOpenGuestAccess: () => {},
        onStart: () => {},
        snapshot: whatsAppPrototypeSnapshot,
        starting: false,
        textAlign: "left",
        whatsAppPrototype: slot,
      }),
    );
    const nodes = appearanceNodes(tree);
    const guest = nodes.findIndex(
      (n) => n.props.accessibilityLabel === "Guest Access",
    );
    const added = nodes.findIndex(
      (n) => n.props.testID === "whatsapp-prototype-marker",
    );
    expect(guest).toBeGreaterThan(-1);
    expect(added).toBeGreaterThan(guest);
    expect(nodes.at(-1)?.props.testID).toBe("whatsapp-prototype-marker");
    // Compare every original host/style after removing only the added control.
    const value = tree as { props: { children: unknown[] } };
    expect({
      ...value,
      props: { ...value.props, children: value.props.children.slice(0, -1) },
    }).toEqual(original);
    vi.unstubAllGlobals();
  });

  it.each([false, true])(
    "keeps normal callbacks unchanged in development=%s",
    (development) => {
      vi.stubGlobal("__DEV__", development);
      const guest = vi.fn();
      const parking = vi.fn();
      const tree = resolveAppearanceTree(
        NativeCheckInParkingTaskStep({
          copy: getNativeCheckInCopy("en"),
          error: false,
          locale: "en",
          onOpenGuestAccess: guest,
          onStart: parking,
          snapshot: whatsAppPrototypeSnapshot,
          starting: false,
          textAlign: "left",
        }),
        false,
        true,
      );
      const nodes = appearanceNodes(tree);
      (
        nodes.find((n) => n.props.accessibilityLabel === "Guest Access")!.props
          .onPress as () => void
      )();
      (
        nodes.find((n) => n.props.accessibilityLabel === "Open Parking")!.props
          .onPress as () => void
      )();
      expect(guest).toHaveBeenCalledExactlyOnceWith("demo-session");
      expect(parking).toHaveBeenCalledOnce();
      vi.unstubAllGlobals();
    },
  );

  it("ignores an injected prototype in release mode", () => {
    vi.stubGlobal("__DEV__", false);
    const tree = resolveAppearanceTree(
      NativeCheckInParkingTaskStep({
        copy: getNativeCheckInCopy("en"),
        error: false,
        locale: "en",
        onOpenGuestAccess: () => {},
        onStart: () => {},
        snapshot: whatsAppPrototypeSnapshot,
        starting: false,
        textAlign: "left",
        whatsAppPrototype: (
          <Text testID="whatsapp-prototype-marker">Demo only</Text>
        ),
      }),
    );
    expect(tree).toEqual(render("en"));
    vi.unstubAllGlobals();
  });

  it.each(["no-session", "no-guest-entry"])(
    "does not orphan the control when %s",
    (missing) => {
      vi.stubGlobal("__DEV__", true);
      const tree = resolveAppearanceTree(
        NativeCheckInParkingTaskStep({
          copy: getNativeCheckInCopy("en"),
          error: false,
          locale: "en",
          onOpenGuestAccess:
            missing === "no-guest-entry" ? undefined : () => {},
          onStart: () => {},
          snapshot:
            missing === "no-session"
              ? { ...whatsAppPrototypeSnapshot, active: null }
              : whatsAppPrototypeSnapshot,
          starting: false,
          textAlign: "left",
          whatsAppPrototype: (
            <Text testID="whatsapp-prototype-marker">Demo only</Text>
          ),
        }),
      );
      expect(
        appearanceNodes(tree).some(
          (n) => n.props.testID === "whatsapp-prototype-marker",
        ),
      ).toBe(false);
      vi.unstubAllGlobals();
    },
  );
});
