import { globSync, readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const adapters = vi.hoisted(() => ({
  copied: [] as string[],
  encoded: [] as string[],
  setStringAsync: vi.fn(async (value: string) => {
    adapters.copied.push(value);
  }),
}));

vi.mock("expo-clipboard", () => ({
  setStringAsync: adapters.setStringAsync,
}));
vi.mock("react-native", () => ({
  StyleSheet: { create: (value: unknown) => value },
  View: "View",
}));
vi.mock("react-native-svg", () => ({
  default: "Svg",
  Path: "Path",
  Rect: "Rect",
}));
vi.mock("qrcode", () => ({
  default: {
    create: (value: string) => {
      adapters.encoded.push(value);
      const data = new Uint8Array(21 * 21);
      data[0] = 1;
      return { modules: { data, size: 21 } };
    },
  },
}));

const {
  buildNativeGuestAccessUrl,
  isCanonicalNativeGuestAccessUrl,
  resolveNativeCustomerAppOrigin,
} = await import("../src/guest-access/native-customer-app-origin");
const { copyNativeGuestAccessUrl } =
  await import("../src/guest-access/native-guest-access-clipboard");
const { createNativeGuestAccessQrMatrix } =
  await import("../src/guest-access/native-guest-access-qr");
const token = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef012345678-_";
const canonicalUrl = `https://customer.example.com/#guestToken=${token}`;

describe("Native Customer origin configuration", () => {
  it("fails closed for missing, relative, credentialed, query, fragment, and path values", () => {
    for (const raw of [
      undefined,
      "",
      "customer.example.com",
      "https://u:p@customer.example.com",
      "https://customer.example.com/?x=1",
      "https://customer.example.com/#x",
      "https://customer.example.com/app",
    ]) {
      expect(
        resolveNativeCustomerAppOrigin({ isProduction: false, raw }).ok,
      ).toBe(false);
    }
  });

  it("rejects every release HTTP origin", () => {
    for (const raw of [
      "http://localhost:3002",
      "http://127.0.0.1:3002",
      "http://customer.example.com",
    ]) {
      expect(
        resolveNativeCustomerAppOrigin({ isProduction: true, raw }),
      ).toEqual({ ok: false, reason: "INVALID" });
    }
  });

  it("allows only localhost HTTP in development and canonicalizes HTTPS", () => {
    expect(
      resolveNativeCustomerAppOrigin({
        isProduction: false,
        raw: "http://localhost:3002/",
      }),
    ).toEqual({ ok: true, origin: "http://localhost:3002" });
    expect(
      resolveNativeCustomerAppOrigin({
        isProduction: false,
        raw: "http://192.168.1.2:3002",
      }).ok,
    ).toBe(false);
    expect(
      resolveNativeCustomerAppOrigin({
        isProduction: true,
        raw: "https://customer.example.com/",
      }),
    ).toEqual({ ok: true, origin: "https://customer.example.com" });
  });

  it("builds only the exact 43-character fragment credential URL", () => {
    expect(
      buildNativeGuestAccessUrl("https://customer.example.com", token),
    ).toBe(canonicalUrl);
    expect(
      buildNativeGuestAccessUrl("https://customer.example.com", token.slice(1)),
    ).toBeNull();
    expect(
      buildNativeGuestAccessUrl(
        "https://customer.example.com",
        `${token.slice(0, -1)}+`,
      ),
    ).toBeNull();
    expect(isCanonicalNativeGuestAccessUrl(canonicalUrl, true)).toBe(true);
    expect(
      isCanonicalNativeGuestAccessUrl(
        `https://customer.example.com/?guestToken=${token}`,
        true,
      ),
    ).toBe(false);
  });
});

describe("Native Guest Access QR and clipboard adapters", () => {
  beforeEach(() => {
    adapters.copied = [];
    adapters.encoded = [];
    adapters.setStringAsync.mockClear();
  });

  it("passes the exact same canonical payload to QR and explicit Copy", async () => {
    const matrix = createNativeGuestAccessQrMatrix(canonicalUrl);
    expect(matrix).toMatchObject({ size: 21 });
    expect(await copyNativeGuestAccessUrl(canonicalUrl)).toBe(true);
    expect(adapters.encoded).toEqual([canonicalUrl]);
    expect(adapters.copied).toEqual([canonicalUrl]);
  });

  it("rejects absent or stale/malformed credential surfaces", async () => {
    expect(createNativeGuestAccessQrMatrix(null)).toBeNull();
    expect(
      createNativeGuestAccessQrMatrix("https://customer.example.com"),
    ).toBeNull();
    expect(await copyNativeGuestAccessUrl(null)).toBe(false);
    expect(await copyNativeGuestAccessUrl("https://customer.example.com")).toBe(
      false,
    );
    expect(adapters.encoded).toHaveLength(0);
    expect(adapters.setStringAsync).not.toHaveBeenCalled();
  });

  it("reports clipboard failure truthfully without exposing the payload", async () => {
    adapters.setStringAsync.mockRejectedValueOnce(new Error("unavailable"));
    expect(await copyNativeGuestAccessUrl(canonicalUrl)).toBe(false);
  });

  it("uses qrcode's pure-JS matrix API without a canvas", async () => {
    const actual = await vi.importActual<typeof import("qrcode")>("qrcode");
    const generated = actual.create(canonicalUrl, {
      errorCorrectionLevel: "M",
    });
    expect(generated.modules.size).toBeGreaterThanOrEqual(21);
    expect(generated.modules.data).toHaveLength(
      generated.modules.size * generated.modules.size,
    );
  });
});

describe("Native Guest Access secret-channel exclusions", () => {
  it("has no persistence, logging, telemetry, or token route channel", () => {
    const guestSource = globSync("src/guest-access/*.{ts,tsx}", {
      cwd: new URL("../", import.meta.url),
    })
      .map((path) =>
        readFileSync(new URL(`../${path}`, import.meta.url), "utf8"),
      )
      .join("\n");
    const routeSource = readFileSync(
      new URL("../src/shell/native-contextual-route.ts", import.meta.url),
      "utf8",
    );
    expect(guestSource).not.toMatch(
      /AsyncStorage|SecureStore|SQLite|FileSystem|console\.|analytics|telemetry|breadcrumb/iu,
    );
    expect(routeSource).not.toMatch(/guestToken|rawToken|credentialUrl/iu);
  });
});
