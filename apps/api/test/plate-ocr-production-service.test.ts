import { afterEach, describe, expect, it, vi } from "vitest";
import type { PostgresPool } from "../src/common/database/postgres";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import type { PlateOcrAdmissionExecutor } from "../src/modules/check-in-api/plate-ocr-admission/plate-ocr-admission-executor";
import type { PlateOcrCostGuard } from "../src/modules/check-in-api/plate-ocr-cost-guard";
import { PlateOcrCostGuard as RealPlateOcrCostGuard } from "../src/modules/check-in-api/plate-ocr-cost-guard";
import { readPlateOcrConfig } from "../src/modules/check-in-api/plate-ocr-config";
import type { PlateOcrProvider } from "../src/modules/check-in-api/plate-ocr-provider";
import { PlateOcrService } from "../src/modules/check-in-api/plate-ocr.service";
import { PlateRecognizerSnapshotProvider } from "../src/modules/check-in-api/plate-recognizer-snapshot.provider";

const session: StaffSessionContext = {
  accessTokenHash: "test-access-hash",
  staffAuthSessionId: "11111111-1111-4111-8111-111111111111",
  createdAt: new Date("2026-11-05T10:00:00.000Z"),
  userId: "22222222-2222-4222-8222-222222222222",
};
const input = {
  targetLocationId: "33333333-3333-4333-8333-333333333333",
  plateCountry: "JO" as const,
};
const image = new Uint8Array([255, 216, 255, 217]);
const attempt = {
  attemptId: "44444444-4444-4444-8444-444444444444",
  organizationId: "55555555-5555-4555-8555-555555555555",
  membershipId: "66666666-6666-4666-8666-666666666666",
  locationId: input.targetLocationId,
  periodId: "77777777-7777-4777-8777-777777777777",
  accountAlias: "qa-snapshot",
  ownerNonce: "88888888-8888-4888-8888-888888888888",
  revision: "1",
};
const config = readPlateOcrConfig({
  NODE_ENV: "production",
  PLATE_OCR_ENDPOINT: "https://ocr.example.test/read/",
  PLATE_OCR_TOKEN: "test-only-secret",
})!;

function setup(provider: PlateOcrProvider) {
  const query = vi.fn().mockResolvedValue({
    rowCount: 1,
    rows: [{ settled: true }],
  });
  const pool = { query } as unknown as PostgresPool;
  const cost = {
    isControlledNonProduction: () => false,
    acquire: vi.fn(() => undefined),
  } as unknown as PlateOcrCostGuard;
  const admit = vi.fn().mockResolvedValue({
    status: "ADMITTED",
    attempt,
    permit: { consumeIfFresh: () => true },
  });
  const admission = { admit } as unknown as PlateOcrAdmissionExecutor;
  const service = new PlateOcrService(pool, cost, admission, provider);
  return { service, pool, query, admit, cost, admission };
}

function provider(http: typeof fetch) {
  return new PlateRecognizerSnapshotProvider(config, http);
}

afterEach(() => vi.restoreAllMocks());

describe("production OCR service shared admission/settlement", () => {
  it.each(["test", "development", "production"])(
    "requires durable A with external HTTPS even when NODE_ENV=%s",
    async (mode) => {
      const http = vi.fn<typeof fetch>();
      const snapshot = provider(http);
      const c = setup(snapshot);
      const liveCost = new RealPlateOcrCostGuard(mode, () => 0);
      expect(liveCost.isControlledNonProduction()).toBe(false);
      c.admit.mockResolvedValueOnce({
        status: "UNAVAILABLE",
        reason: "DISABLED",
      });
      const service = new PlateOcrService(
        c.pool,
        liveCost,
        c.admission,
        snapshot,
      );
      expect(
        await service.recognize(
          session,
          input,
          image,
          new AbortController().signal,
        ),
      ).toEqual({ status: "UNAVAILABLE" });
      expect(c.admit).toHaveBeenCalledOnce();
      expect(http).not.toHaveBeenCalled();
      expect(c.query).not.toHaveBeenCalled();
    },
  );
  it("reaches exactly one HTTPS fetch after known admission and settles UNKNOWN", async () => {
    const http = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{"results":[{"plate":"AA123","score":0.91}]}', {
        status: 201,
      }),
    );
    const c = setup(provider(http));
    const response = await c.service.recognize(
      session,
      input,
      image,
      new AbortController().signal,
    );
    expect(response).toEqual({
      status: "MATCH",
      candidate: { plateNumberRaw: "AA123", confidence: 0.91 },
    });
    expect(c.admit).toHaveBeenCalledExactlyOnceWith(
      session,
      input.targetLocationId,
      4000,
    );
    expect(http).toHaveBeenCalledOnce();
    expect(String(http.mock.calls[0]?.[0])).toBe(config.endpoint);
    expect(c.query).toHaveBeenCalledOnce();
    const [sql, params] = c.query.mock.calls[0]!;
    expect(String(sql)).toContain("public.ocr_settle");
    expect(params).toEqual([
      attempt.attemptId,
      attempt.organizationId,
      attempt.membershipId,
      attempt.locationId,
      attempt.periodId,
      attempt.accountAlias,
      attempt.ownerNonce,
      attempt.revision,
      "UNKNOWN",
      "HTTP_COMPLETE",
      "2XX",
      "NONE",
      expect.any(Number),
    ]);
    expect(c.cost.acquire).not.toHaveBeenCalled();
  });

  it("does not dispatch or settle on denied admission", async () => {
    const http = vi.fn<typeof fetch>();
    const c = setup(provider(http));
    c.admit.mockResolvedValueOnce({ status: "UNAVAILABLE", reason: "QUOTA" });
    expect(
      await c.service.recognize(
        session,
        input,
        image,
        new AbortController().signal,
      ),
    ).toEqual({ status: "UNAVAILABLE" });
    expect(http).not.toHaveBeenCalled();
    expect(c.query).not.toHaveBeenCalled();
  });

  it("settles NOT_SENT if the inbound request disconnects after committed A", async () => {
    const abort = new AbortController();
    const http = vi.fn<typeof fetch>();
    const c = setup(provider(http));
    c.admit.mockImplementationOnce(async () => {
      abort.abort();
      return {
        status: "ADMITTED",
        attempt,
        permit: { consumeIfFresh: () => true },
      };
    });
    expect(
      await c.service.recognize(session, input, image, abort.signal),
    ).toEqual({ status: "UNAVAILABLE" });
    expect(http).not.toHaveBeenCalled();
    expect(c.query.mock.calls[0]?.[1]).toEqual([
      attempt.attemptId,
      attempt.organizationId,
      attempt.membershipId,
      attempt.locationId,
      attempt.periodId,
      attempt.accountAlias,
      attempt.ownerNonce,
      attempt.revision,
      "NOT_SENT",
      "NOT_INVOKED",
      "NONE",
      "NONE",
      expect.any(Number),
    ]);
  });

  it("stale sealed permit produces no HTTP and one NOT_SENT settlement", async () => {
    const consumeIfFresh = vi.fn(() => false);
    const http = vi.fn<typeof fetch>();
    const c = setup(provider(http));
    c.admit.mockResolvedValueOnce({
      status: "ADMITTED",
      attempt,
      permit: { consumeIfFresh },
    });
    expect(
      await c.service.recognize(
        session,
        input,
        image,
        new AbortController().signal,
      ),
    ).toEqual({ status: "UNAVAILABLE" });
    expect(consumeIfFresh).toHaveBeenCalledOnce();
    expect(http).not.toHaveBeenCalled();
    expect(c.query.mock.calls[0]?.[1]?.[8]).toBe("NOT_SENT");
  });

  it("defaults to UNKNOWN if provider unexpectedly throws after A", async () => {
    const fallbackProvider = {
      ...provider(vi.fn<typeof fetch>()),
      canDispatch: () => true,
      admissionTimeoutMs: () => 4_000,
      recognizeObserved: async () => {
        throw new Error("unsafe secret error");
      },
    } as unknown as PlateOcrProvider;
    const c = setup(fallbackProvider);
    expect(
      await c.service.recognize(
        session,
        input,
        image,
        new AbortController().signal,
      ),
    ).toEqual({ status: "UNAVAILABLE" });
    expect(c.query.mock.calls[0]?.[1]?.slice(8, 12)).toEqual([
      "UNKNOWN",
      "UNCERTAIN",
      "NONE",
      "OTHER",
    ]);
  });

  it("does not request admission for missing provider configuration", async () => {
    const c = setup(new PlateRecognizerSnapshotProvider(undefined, vi.fn()));
    expect(
      await c.service.recognize(
        session,
        input,
        image,
        new AbortController().signal,
      ),
    ).toEqual({ status: "UNAVAILABLE" });
    expect(c.admit).not.toHaveBeenCalled();
    expect(c.query).not.toHaveBeenCalled();
  });
});
