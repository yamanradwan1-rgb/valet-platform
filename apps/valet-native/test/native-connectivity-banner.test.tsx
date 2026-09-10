import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  View: "View",
}));

const { elements, content, style } =
  await import("./native-check-in-condition-test-support");
const { NativeConnectivityBanner } =
  await import("../src/shell/native-connectivity-banner");

describe("Native global connectivity banner presentation boundary", () => {
  it.each([true, undefined])(
    "renders no banner for online/unknown %s",
    (online) => {
      expect(NativeConnectivityBanner({ locale: "en", online })).toBeNull();
    },
  );

  it.each([
    ["en", "No network connection. Reconnect to refresh and continue."],
    ["ar", "لا يوجد اتصال بالشبكة. أعد الاتصال للتحديث والمتابعة."],
  ] as const)("renders exact danger banner copy in %s", (locale, expected) => {
    const nodes = elements(NativeConnectivityBanner({ locale, online: false }));
    expect(content(nodes)).toContain(expected);
    expect(
      style(
        nodes.find((node) => node.props.testID === "native-offline-banner")!,
      ),
    ).toMatchObject({
      backgroundColor: "#D95C63",
      paddingHorizontal: 16,
      paddingVertical: 8,
      width: "100%",
    });
    expect(content(nodes)).not.toMatch(/queued|sync/iu);
  });
});
