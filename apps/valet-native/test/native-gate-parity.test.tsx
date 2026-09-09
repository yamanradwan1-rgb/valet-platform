import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactElement } from "react";
import type { NativeAuthSession } from "@valet/employee-client";
import { describe, expect, it, vi } from "vitest";

vi.mock("react", () => ({
  useEffect: vi.fn(),
  useState: (value: unknown) => [
    typeof value === "function" ? value() : value,
    vi.fn(),
  ],
}));
vi.mock("react-native", () => ({
  Animated: {
    Value: vi.fn(),
    View: "AnimatedView",
    loop: vi.fn(),
    timing: vi.fn(),
  },
  Image: "Image",
  KeyboardAvoidingView: "KeyboardAvoidingView",
  Platform: { OS: "android" },
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: "SafeAreaView",
}));
vi.mock("expo-status-bar", () => ({ StatusBar: "StatusBar" }));

const { NativeAuthPanel, nativeAuthGateStyles } =
  await import("../src/auth/native-auth-panel");
const { getNativeAuthCopy } = await import("../src/auth/native-auth-copy");
const {
  NativeGateButton,
  NativeGateCard,
  NativeGateLocaleToggle,
  nativeGateControlStyles,
} = await import("../src/shell/native-gate-primitives");
const { GateRadialBackground, nativeGateShellStyles } =
  await import("../src/shell/native-gate-shell");
const { NativeShellGate } = await import("../src/shell/native-shell-gate");

type Element = ReactElement<Record<string, unknown>>;

function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...elements(node.props.children)];
}

function style(value: unknown): Record<string, unknown> {
  if (typeof value === "function") {
    return style(
      (value as (state: { pressed: boolean }) => unknown)({
        pressed: false,
      }),
    );
  }
  if (Array.isArray(value))
    return Object.assign({}, ...value.filter(Boolean).map(style));
  return (value ?? {}) as Record<string, unknown>;
}

const authSession = {
  login: vi.fn(async () => undefined),
  logout: vi.fn(async () => undefined),
  refresh: vi.fn(async () => undefined),
} as unknown as NativeAuthSession;

describe("Native Employee gate parity", () => {
  it("represents the Web radial background and exact access-shell geometry", () => {
    const gradient = elements(GateRadialBackground()).find(
      (node) => node.type === "RadialGradient",
    )!;
    const stops = elements(GateRadialBackground()).filter(
      (node) => node.type === "Stop",
    );

    expect(gradient.props).toMatchObject({
      cx: "55%",
      cy: "0%",
      fx: "55%",
      fy: "0%",
      rx: "65%",
      ry: "65%",
    });
    expect(stops.map((node) => node.props)).toEqual([
      { offset: "0%", stopColor: "#0B2D6E" },
      { offset: "100%", stopColor: "#07111F" },
    ]);
    expect(nativeGateShellStyles.logo).toMatchObject({
      aspectRatio: 3.1,
      height: 36,
      marginBottom: 48,
    });
    expect(nativeGateShellStyles.screen).toMatchObject({
      paddingBottom: 40,
      paddingHorizontal: 24,
    });
  });

  it("uses gate-specific card, button, blur, and compact locale contracts", () => {
    const card = elements(NativeGateCard({ children: "content" }));
    expect(style(card[0]!.props.style)).toMatchObject({
      backgroundColor: "#FFFFFF0F",
      borderColor: "#FFFFFF1A",
      borderRadius: 24,
      padding: 24,
    });
    expect(card.some((node) => node.type === "BlurView")).toBe(true);

    const loginButton = elements(
      NativeGateButton({ label: "Sign In", onPress: vi.fn(), size: "login" }),
    );
    expect(style(loginButton[0]!.props.style)).toMatchObject({
      borderRadius: 16,
      height: 56,
      shadowColor: "#176BFF",
    });
    expect(style(loginButton[1]!.props.style)).toMatchObject({
      fontSize: 16,
      fontWeight: "700",
    });
    expect(nativeGateControlStyles.disabled.opacity).toBe(0.6);
    expect(
      style(
        elements(
          NativeGateButton({
            label: "Sign Out",
            onPress: vi.fn(),
            variant: "secondary",
          }),
        )[0]!.props.style,
      ).height,
    ).toBe(44);

    const toggle = NativeGateLocaleToggle({
      locale: "en",
      onSelectLocale: vi.fn(),
    });
    const choices = elements(toggle).filter(
      (node) => typeof node.type === "function",
    );
    expect(choices.map((node) => node.props.label)).toEqual(["EN", "عربي"]);
    expect(elements(toggle).some((node) => node.props.children === "/")).toBe(
      true,
    );
  });

  it("renders explicit labels, 48px fields, and an error outside the login card", () => {
    const panel = NativeAuthPanel({
      copy: getNativeAuthCopy("en"),
      gate: true,
      session: authSession,
      snapshot: {
        authGeneration: 1,
        phase: "unauthenticated",
        reason: "authentication-failed",
      },
      textAlign: "left",
    });
    const rendered = (panel.type as (props: unknown) => unknown)(panel.props);
    const nodes = elements(rendered);
    const cardIndex = nodes.findIndex(
      (node) => node.props.testID === "native-auth-login-card",
    );
    const errorIndex = nodes.findIndex(
      (node) => node.props.testID === "native-auth-login-error",
    );
    const submitIndex = nodes.findIndex(
      (node) => node.type === NativeGateButton,
    );
    const fields = nodes.filter((node) => node.type === "TextInput");

    expect(
      nodes
        .filter(
          (node) =>
            typeof node.type === "function" &&
            node.type.name === "GateFieldLabel",
        )
        .map((node) => node.props.label),
    ).toEqual(["Work email", "Password"]);
    expect(fields).toHaveLength(2);
    expect(
      fields.every((field) => style(field.props.style).height === 48),
    ).toBe(true);
    expect(cardIndex).toBeLessThan(errorIndex);
    expect(errorIndex).toBeLessThan(submitIndex);
    expect(nativeAuthGateStyles.fieldLabel).toMatchObject({
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.6,
      marginBottom: 8,
      textTransform: "uppercase",
    });
  });

  it("keeps loading standalone and orders no-shift siblings like Web", () => {
    const source = readFileSync(
      resolve(import.meta.dirname, "../src/shell/native-shell-gate.tsx"),
      "utf8",
    );
    const loading = source.slice(
      source.indexOf("function LoadingGate"),
      source.indexOf("function NoActiveShiftGate"),
    );
    const noShift = source.slice(
      source.indexOf("function NoActiveShiftGate"),
      source.indexOf("function BlockingGate"),
    );

    expect(loading).toContain("<NativeGateSpinner");
    expect(loading).not.toContain("<NativeGateCard");
    expect(noShift.indexOf("native-no-shift-card")).toBeLessThan(
      noShift.indexOf("<NativeGateLocaleToggle"),
    );
    expect(noShift.indexOf("<NativeGateLocaleToggle")).toBeLessThan(
      noShift.indexOf("<NativeShiftStartPanel"),
    );
    expect(noShift.indexOf("<NativeShiftStartPanel")).toBeLessThan(
      noShift.indexOf("label={copy.retry}"),
    );
    expect(noShift.indexOf("label={copy.retry}")).toBeLessThan(
      noShift.indexOf("label={copy.signOut}"),
    );
  });

  it("shows authoritative ambiguous count and a distinct red error family", () => {
    const baseProps = {
      auth: authSession,
      authSnapshot: { authGeneration: 1, phase: "authenticated" } as const,
      locale: "en" as const,
      onRetryContext: vi.fn(),
      onSelectLocale: vi.fn(),
      onSignOut: vi.fn(),
      shiftStart: undefined,
      shiftStartSnapshot: {
        failure: null,
        identityGeneration: 1,
        phase: "inactive" as const,
        selectedLocationId: null,
        startableLocations: [],
        targetLocationId: null,
      },
    };
    const renderBlocking = (
      state:
        | {
            readonly count: number;
            readonly kind: "operational-error";
            readonly reason: "ambiguous-active-shifts";
          }
        | {
            readonly kind: "operational-error";
            readonly message: string;
            readonly reason: "unavailable";
          },
    ) => {
      const shell = NativeShellGate({ ...baseProps, state });
      const blocking = elements(shell).find(
        (node) =>
          typeof node.type === "function" && node.type.name === "BlockingGate",
      )!;
      return elements(
        (blocking.type as (props: unknown) => unknown)(blocking.props),
      );
    };

    const ambiguous = renderBlocking({
      count: 3,
      kind: "operational-error",
      reason: "ambiguous-active-shifts",
    });
    expect(ambiguous.some((node) => node.props.children === 3)).toBe(true);
    expect(
      ambiguous.find((node) => node.type === NativeGateCard)?.props.tone,
    ).toBe("neutral");

    const failure = renderBlocking({
      kind: "operational-error",
      message: "Authoritative failure",
      reason: "unavailable",
    });
    expect(
      failure.find((node) => node.type === NativeGateCard)?.props.tone,
    ).toBe("error");
    expect(
      failure.some((node) => node.props.children === "Authoritative failure"),
    ).toBe(true);
  });
});
