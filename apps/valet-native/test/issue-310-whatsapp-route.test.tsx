import { describe, expect, it, vi } from "vitest";

const route = vi.hoisted(() => ({
  params: {} as Record<string, unknown>,
  back: vi.fn(),
}));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => route.params,
  useRouter: () => ({ back: route.back }),
}));
vi.mock("../src/prototypes/whatsapp/native-whatsapp-prototype-screen", () => ({
  NativeWhatsAppPrototypeScreen: "NativeWhatsAppPrototypeScreen",
}));
const { default: WhatsAppPrototypeRoute } =
  await import("../app/whatsapp-prototype");

describe("Issue #310 development fixture entry", () => {
  it("cannot display the prototype in release mode", () => {
    vi.stubGlobal("__DEV__", false);
    route.params = { locale: "ar", theme: "dark", state: "delivered" };
    expect(WhatsAppPrototypeRoute()).toBeNull();
    vi.unstubAllGlobals();
  });

  it("accepts only finite demo choices and cannot accept live business inputs", () => {
    vi.stubGlobal("__DEV__", true);
    route.params = {
      locale: "ar",
      theme: "dark",
      state: "delivered",
      baseline: "1",
      phone: "ignored",
      sessionId: "ignored",
      token: "ignored",
    };
    const view = WhatsAppPrototypeRoute()!;
    expect(view.props).toMatchObject({
      locale: "ar",
      theme: "dark",
      initialState: "delivered",
      baseline: true,
    });
    expect(view.props).not.toHaveProperty("phone");
    expect(view.props).not.toHaveProperty("sessionId");
    expect(view.props).not.toHaveProperty("token");
    route.params = {
      locale: ["ar"],
      theme: "invalid",
      state: "live",
      baseline: "true",
    };
    expect(WhatsAppPrototypeRoute()!.props).toMatchObject({
      locale: "en",
      theme: "light",
      initialState: "default",
      baseline: false,
    });
    vi.unstubAllGlobals();
  });
});
