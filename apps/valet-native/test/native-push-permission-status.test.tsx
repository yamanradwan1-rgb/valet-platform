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
              ? "unconfirmed"
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

  it("does not claim remote confirmation while registration is unconfirmed", () => {
    const { visible } = render("granted");
    expect(
      JSON.stringify(visible.map((node) => node.props.children)),
    ).toContain("this device is not yet confirmed");
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
