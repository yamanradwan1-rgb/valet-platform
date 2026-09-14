import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const openSettings = vi.hoisted(() => vi.fn());
vi.mock("react-native", () => ({
  Linking: { openSettings },
  Platform: { select: (choices: { default?: unknown }) => choices.default },
  Pressable: "Pressable",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  View: "View",
}));

const { NativePushPermissionStatus } =
  await import("../src/notifications/native-push-permission-status");
const { getNativePushCopy } =
  await import("../src/notifications/native-push-copy");

type Element = ReactElement<Record<string, unknown>>;

function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...elements(node.props.children)];
}

function render(
  permission: "blocked" | "denied" | "granted" | "undetermined",
  channelAvailable = true,
  registration:
    | "confirmed"
    | "network-unavailable"
    | "registration-error"
    | "token-unavailable" = "registration-error",
) {
  const onRequestPermission = vi.fn(async () => undefined);
  const visible = elements(
    NativePushPermissionStatus({
      locale: "en",
      onRequestPermission,
      snapshot: {
        attentionIntentIds: [],
        channelAvailable,
        permission,
        registration:
          permission === "granted" && !channelAvailable
            ? "confirmed"
            : permission === "granted"
              ? registration
              : "idle",
      },
      textAlign: "left",
    }),
  );
  return { onRequestPermission, visible };
}

beforeEach(() => vi.clearAllMocks());

describe("Native push permission status", () => {
  it.each(["undetermined", "denied"] as const)(
    "offers an explicit request for %s permission without disabling the queue",
    (permission) => {
      const { onRequestPermission, visible } = render(permission);
      expect(
        JSON.stringify(visible.map((node) => node.props.children)),
      ).toContain("The Task queue keeps refreshing either way.");
      const action = visible.find(
        (node) => node.props.accessibilityRole === "button",
      )!;
      (action.props.onPress as () => void)();
      expect(onRequestPermission).toHaveBeenCalledOnce();
      expect(openSettings).not.toHaveBeenCalled();
    },
  );

  it("guides blocked permission to Android settings", () => {
    const { onRequestPermission, visible } = render("blocked");
    const action = visible.find(
      (node) => node.props.accessibilityRole === "button",
    )!;
    (action.props.onPress as () => void)();
    expect(openSettings).toHaveBeenCalledOnce();
    expect(onRequestPermission).not.toHaveBeenCalled();
  });

  it("does not label an HTTP reconciliation failure as connectivity", () => {
    const { visible } = render("granted");
    const text = JSON.stringify(visible.map((node) => node.props.children));
    expect(text).toContain("device registration could not be confirmed");
    expect(text).not.toContain("connectivity");
  });

  it("shows enabled state immediately after registration is confirmed", () => {
    const { visible } = render("granted", true, "confirmed");
    expect(
      JSON.stringify(visible.map((node) => node.props.children)),
    ).toContain("Retrieval task notifications are enabled.");
  });

  it("reserves connectivity copy for a transport network failure", () => {
    const { visible } = render("granted", true, "network-unavailable");
    expect(
      JSON.stringify(visible.map((node) => node.props.children)),
    ).toContain("connectivity returns");
  });

  it("distinguishes unavailable token acquisition", () => {
    const { visible } = render("granted", true, "token-unavailable");
    expect(
      JSON.stringify(visible.map((node) => node.props.children)),
    ).toContain("device notification token is not available yet");
  });

  it("keeps reconciliation, network, and token copy in EN/AR parity", () => {
    for (const locale of ["en", "ar"] as const) {
      const localized = getNativePushCopy(locale);
      expect(localized.registrationError.length).toBeGreaterThan(20);
      expect(localized.networkUnavailable.length).toBeGreaterThan(20);
      expect(localized.tokenUnavailable.length).toBeGreaterThan(20);
    }
  });

  it("reports channel revocation and guides the user to Android settings", () => {
    const { visible } = render("granted", false);
    const action = visible.find(
      (node) => node.props.accessibilityRole === "button",
    )!;
    (action.props.onPress as () => void)();
    expect(
      JSON.stringify(visible.map((node) => node.props.children)),
    ).toContain("retrieval alert channel is off");
    expect(openSettings).toHaveBeenCalledOnce();
  });
});
