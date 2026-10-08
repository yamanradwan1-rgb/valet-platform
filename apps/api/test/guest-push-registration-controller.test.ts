import { describe, expect, it, vi } from "vitest";

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
});
