import { describe, expect, it, vi } from "vitest";
import { GUEST_BROWSER_CSRF_HEADER, GUEST_BROWSER_CSRF_VALUE } from "@valet/contracts";

import { GuestCredentialAuthorizer } from "../src/modules/guest-access/guest-credential-authorizer";
import { GuestPushRegistrationController } from "../src/modules/guest-push-registration/guest-push-registration.controller";

const endpoint = "https://fcm.googleapis.com/fcm/send/opaque-subscription";
const payload = {
  auth: "C".repeat(22),
  endpoint,
  locale: "en" as const,
  p256dh: "B".repeat(87),
};

function harness() {
  const service = {
    config: vi.fn(async () => ({ enabled: true, publicKey: "A".repeat(87) })),
    register: vi.fn(async () => undefined),
    status: vi.fn(async () => ({ active: true })),
  };
  const runner = {
    run: vi.fn(async (_policy: unknown, _request: unknown, action: () => unknown) => action()),
  };
  const credential = { kind: "BROWSER_SESSION", secret: `vgb1.${"D".repeat(43)}` };
  const authorizer = {
    authorize: vi.fn(async (
      _request: unknown,
      _options: unknown,
      operation: (reservation: never, credential: never) => unknown,
    ) => operation({} as never, credential as never)),
  };
  const controller = new GuestPushRegistrationController(
    service as never,
    runner as never,
    authorizer as never,
  );
  const headers = new Map<string, string>();
  const response = {
    setHeader: (name: string, value: string) => headers.set(name, value),
  };
  return { authorizer, controller, headers, response, runner, service };
}

describe("Guest Push registration HTTP composition", () => {
  it("serves config through authenticated class-A Browser Session with no-store", async () => {
    const h = harness();
    await expect(h.controller.config({} as never, {}, h.response)).resolves.toEqual({
      enabled: true,
      publicKey: "A".repeat(87),
    });
    expect(h.authorizer.authorize).toHaveBeenCalledWith(
      {},
      { mutation: false, requestClass: "A" },
      expect.any(Function),
    );
    expect(h.headers.get("Cache-Control")).toBe("no-store");
    expect(h.headers.get("Pragma")).toBe("no-cache");
  });

  it("registers only through Browser Session mutation class B", async () => {
    const h = harness();
    await h.controller.register({} as never, payload, {}, h.response);
    expect(h.authorizer.authorize).toHaveBeenCalledWith(
      {},
      { mutation: true, requestClass: "B" },
      expect.any(Function),
    );
    expect(h.service.register).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ kind: "BROWSER_SESSION" }),
      payload,
    );
    expect(h.headers.get("Cache-Control")).toBe("no-store");
  });

  it("rejects extra fields before registration service", async () => {
    const h = harness();
    await expect(h.controller.register(
      {} as never,
      { ...payload, organizationId: "forged" },
      {},
      h.response,
    )).rejects.toThrow("invalid");
    expect(h.service.register).not.toHaveBeenCalled();
  });

  it("reads exact endpoint status with CSRF transport, Class A accounting and no-store", async () => {
    const h = harness();
    await expect(h.controller.status({} as never, { endpoint }, {}, h.response))
      .resolves.toEqual({ active: true });
    expect(h.authorizer.authorize).toHaveBeenCalledWith(
      {}, { mutation: true, requestClass: "A" }, expect.any(Function),
    );
    expect(h.service.status).toHaveBeenCalledWith(
      {}, expect.objectContaining({ kind: "BROWSER_SESSION" }), endpoint,
    );
    expect(h.headers.get("Cache-Control")).toBe("no-store");
    expect(h.service.register).not.toHaveBeenCalled();
  });

  it.each([{ endpoint, auth: "unexpected" }, { endpoint: "https://example.test/private" }, {}])(
    "rejects invalid status input before admission",
    async (body) => {
      const h = harness();
      await expect(h.controller.status({} as never, body, {}, h.response)).rejects.toThrow("invalid");
      expect(h.authorizer.authorize).not.toHaveBeenCalled();
    },
  );

  it("requires an authenticated Browser Session, exact allowed Origin and CSRF for status", async () => {
    const h = harness();
    const admission = { admit: vi.fn(async () => ({ key: { scope: "test", value: "key" } })) };
    const antiAbuse = { finalize: vi.fn(async () => undefined) };
    const authorizer = new GuestCredentialAuthorizer(
      antiAbuse as never,
      { allows: (origin: string) => origin === "https://customer.example.test" } as never,
      admission as never,
    );
    const controller = new GuestPushRegistrationController(h.service as never, h.runner as never, authorizer);
    const cookie = `__Host-vaylet_guest_browser=vgb1.${"D".repeat(43)}`;
    const transport = [
      "Cookie", cookie,
      "Origin", "https://customer.example.test",
      "Content-Type", "application/json",
      GUEST_BROWSER_CSRF_HEADER, GUEST_BROWSER_CSRF_VALUE,
    ];
    const request = (rawHeaders: string[]) => ({
      rawHeaders,
      headers: Object.fromEntries(
        Array.from({ length: rawHeaders.length / 2 }, (_, i) => [
          rawHeaders[i * 2]!.toLowerCase(), rawHeaders[i * 2 + 1]!,
        ]),
      ),
    });

    await expect(controller.status(request(transport) as never, { endpoint }, {}, h.response))
      .resolves.toEqual({ active: true });
    expect(admission.admit).toHaveBeenCalledWith(
      expect.anything(), expect.objectContaining({ kind: "BROWSER_SESSION" }), "A",
    );

    for (const invalidHeaders of [
      transport.slice(0, 6),
      [...transport.slice(0, 2), "Origin", "https://evil.example.test", ...transport.slice(4)],
      [...transport, "Authorization", `Bearer ${"A".repeat(43)}`],
      transport.slice(2),
    ]) {
      h.service.status.mockClear();
      await expect(controller.status(request(invalidHeaders) as never, { endpoint }, {}, h.response))
        .rejects.toThrow();
      expect(h.service.status).not.toHaveBeenCalled();
    }
  });
});
