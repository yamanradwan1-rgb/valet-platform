import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CustodyStaffAuthorizationError } from "../src/modules/staff/custody-staff-authorizer";
import {
  authority,
  config,
  image,
  input,
  scope,
  session,
  setup,
} from "./plate-ocr-direct-service-fixture";

beforeEach(() => {
  authority.session
    .mockReset()
    .mockResolvedValue({ id: session.staffAuthSessionId });
  authority.location.mockReset().mockResolvedValue(scope);
  authority.shift.mockReset().mockResolvedValue({ shiftId: "active-shift" });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("production direct OCR with persisted staff authority", () => {
  it("recognizes MATCH with exactly one HTTPS request and no OCR quota SQL", async () => {
    const http = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{"results":[{"plate":"AA123","score":0.91}]}', {
        status: 201,
      }),
    );
    const c = setup(http);
    expect(
      await c.service.recognize(
        session,
        input,
        image,
        new AbortController().signal,
      ),
    ).toEqual({
      status: "MATCH",
      candidate: { plateNumberRaw: "AA123", confidence: 0.91 },
    });
    expect(http).toHaveBeenCalledOnce();
    expect(http.mock.calls[0]?.[0]).toBe(config.endpoint);
    expect(http.mock.calls[0]?.[1]?.redirect).toBe("error");
    expect(authority.session).toHaveBeenCalledOnce();
    expect(authority.location).toHaveBeenCalledWith(
      expect.anything(),
      session.userId,
      input.targetLocationId,
      true,
    );
    expect(authority.shift).toHaveBeenCalledOnce();
    expect(c.query.mock.calls.map(([sql]) => sql)).toEqual([
      "BEGIN",
      expect.stringContaining("COALESCE"),
      "COMMIT",
    ]);
    expect(c.release).toHaveBeenCalledOnce();
  });

  it("returns NO_MATCH when Plate Recognizer finds no candidates", async () => {
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{"results":[]}', { status: 200 }));
    const c = setup(http);
    expect(
      await c.service.recognize(
        session,
        input,
        image,
        new AbortController().signal,
      ),
    ).toEqual({ status: "NO_MATCH" });
    expect(http).toHaveBeenCalledOnce();
  });

  it("honors the existing Organization/Location OCR policy", async () => {
    const http = vi.fn<typeof fetch>();
    const c = setup(http, { enabled: false });
    expect(
      await c.service.recognize(
        session,
        input,
        image,
        new AbortController().signal,
      ),
    ).toEqual({ status: "UNAVAILABLE" });
    expect(http).not.toHaveBeenCalled();
  });

  it("rejects a revoked Staff session before provider I/O", async () => {
    authority.session.mockResolvedValueOnce(undefined);
    const http = vi.fn<typeof fetch>();
    const c = setup(http);
    await expect(
      c.service.recognize(session, input, image, new AbortController().signal),
    ).rejects.toThrow();
    expect(c.query.mock.calls.map(([sql]) => sql)).toContain("ROLLBACK");
    expect(authority.location).not.toHaveBeenCalled();
    expect(http).not.toHaveBeenCalled();
  });

  it("rejects unauthorized target Locations", async () => {
    authority.location.mockRejectedValueOnce(
      new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED"),
    );
    const http = vi.fn<typeof fetch>();
    const c = setup(http);
    await expect(
      c.service.recognize(session, input, image, new AbortController().signal),
    ).rejects.toThrow();
    expect(authority.shift).not.toHaveBeenCalled();
    expect(http).not.toHaveBeenCalled();
  });

  it("rejects Staff with no eligible active Shift", async () => {
    authority.shift.mockResolvedValueOnce(null);
    const http = vi.fn<typeof fetch>();
    const c = setup(http);
    await expect(
      c.service.recognize(session, input, image, new AbortController().signal),
    ).rejects.toThrow();
    expect(http).not.toHaveBeenCalled();
  });

  it("does not query DB or dispatch without configured provider", async () => {
    const http = vi.fn<typeof fetch>();
    const c = setup(http, { configured: false });
    expect(
      await c.service.recognize(
        session,
        input,
        image,
        new AbortController().signal,
      ),
    ).toEqual({ status: "UNAVAILABLE" });
    expect(c.pool.connect).not.toHaveBeenCalled();
    expect(http).not.toHaveBeenCalled();
  });

  it("fails closed when the normal Staff database is unavailable", async () => {
    const http = vi.fn<typeof fetch>();
    const c = setup(http);
    vi.mocked(c.pool.connect).mockRejectedValueOnce(
      new Error("database unavailable"),
    );
    expect(
      await c.service.recognize(
        session,
        input,
        image,
        new AbortController().signal,
      ),
    ).toEqual({ status: "UNAVAILABLE" });
    expect(authority.session).not.toHaveBeenCalled();
    expect(http).not.toHaveBeenCalled();
  });

  it("fails closed when the authority query fails", async () => {
    const http = vi.fn<typeof fetch>();
    const c = setup(http);
    c.query.mockRejectedValueOnce(new Error("BEGIN failed"));
    expect(
      await c.service.recognize(
        session,
        input,
        image,
        new AbortController().signal,
      ),
    ).toEqual({ status: "UNAVAILABLE" });
    expect(c.release).toHaveBeenCalledOnce();
    expect(http).not.toHaveBeenCalled();
  });

  it("destroys an ambiguous COMMIT connection without provider I/O", async () => {
    const http = vi.fn<typeof fetch>();
    const c = setup(http);
    c.query.mockImplementation(async (sql: string) => {
      if (sql === "COMMIT") throw new Error("commit reply lost");
      return { rowCount: 1, rows: [{ enabled: true }] };
    });
    expect(
      await c.service.recognize(
        session,
        input,
        image,
        new AbortController().signal,
      ),
    ).toEqual({ status: "UNAVAILABLE" });
    expect(c.release).toHaveBeenCalledWith(true);
    expect(http).not.toHaveBeenCalled();
  });

  it("destroys a connection when ROLLBACK fails on rejected Staff authority", async () => {
    authority.session.mockResolvedValueOnce(undefined);
    const http = vi.fn<typeof fetch>();
    const c = setup(http);
    c.query.mockImplementation(async (sql: string) => {
      if (sql === "ROLLBACK") throw new Error("connection lost");
      return { rowCount: 1, rows: [{ enabled: true }] };
    });
    await expect(
      c.service.recognize(session, input, image, new AbortController().signal),
    ).rejects.toThrow();
    expect(c.release).toHaveBeenCalledWith(true);
    expect(http).not.toHaveBeenCalled();
  });

  it("never dispatches a cancelled request", async () => {
    const http = vi.fn<typeof fetch>();
    const c = setup(http);
    const abort = new AbortController();
    abort.abort();
    expect(
      await c.service.recognize(session, input, image, abort.signal),
    ).toEqual({
      status: "UNAVAILABLE",
    });
    expect(http).not.toHaveBeenCalled();
  });

  it("denies a cancellation immediately after transaction authorization", async () => {
    const http = vi.fn<typeof fetch>();
    const c = setup(http);
    const abort = new AbortController();
    c.query.mockImplementation(async (sql: string) => {
      if (sql === "COMMIT") abort.abort();
      return { rowCount: 1, rows: [{ enabled: true }] };
    });
    expect(
      await c.service.recognize(session, input, image, abort.signal),
    ).toEqual({
      status: "UNAVAILABLE",
    });
    expect(http).not.toHaveBeenCalled();
  });

  it("denies stale authorization proof before a paid dispatch", async () => {
    const http = vi.fn<typeof fetch>();
    const c = setup(http);
    c.query.mockImplementation(async (sql: string) => {
      if (sql === "COMMIT")
        await new Promise((resolve) => setTimeout(resolve, 300));
      return { rowCount: 1, rows: [{ enabled: true }] };
    });
    expect(
      await c.service.recognize(
        session,
        input,
        image,
        new AbortController().signal,
      ),
    ).toEqual({ status: "UNAVAILABLE" });
    expect(http).not.toHaveBeenCalled();
  });

  it("blocks a concurrent double Capture in the same process", async () => {
    let arrive!: () => void;
    const arrived = new Promise<void>((resolve) => (arrive = resolve));
    let finish!: (response: Response) => void;
    const http = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
          arrive();
        }),
    );
    const c = setup(http);
    const first = c.service.recognize(
      session,
      input,
      image,
      new AbortController().signal,
    );
    await arrived;
    expect(
      await c.service.recognize(
        session,
        input,
        image,
        new AbortController().signal,
      ),
    ).toEqual({ status: "UNAVAILABLE" });
    expect(http).toHaveBeenCalledOnce();
    finish(new Response('{"results":[]}', { status: 200 }));
    expect(await first).toEqual({ status: "NO_MATCH" });
  });
});
