import { describe, expect, it, vi } from "vitest";
import {
  OCR_MAINTENANCE_BATCH_LIMIT,
  OCR_MAINTENANCE_BATCH_MS,
  OCR_MAINTENANCE_INTERVAL_MS,
  OCR_MAINTENANCE_STATEMENT_MS,
  detectExpiredOcr,
} from "../tools/ocr-control/maintenance";
import type { OcrToolClient } from "../tools/ocr-control/restricted-connection";

function fakeClient(returned = 3) {
  const query = vi.fn(async (sql: string, values?: readonly unknown[]) => {
    if (sql.startsWith("SET ")) return { rowCount: null, rows: [] };
    return { rowCount: 1, rows: [{ detected: returned, values }] };
  });
  return { query, client: { query } as unknown as OcrToolClient };
}

describe("OCR off-path maintenance bounds", () => {
  it("uses one short restricted SQL claim without provider calls", async () => {
    expect(OCR_MAINTENANCE_INTERVAL_MS).toBe(30000);
    expect(OCR_MAINTENANCE_BATCH_LIMIT).toBe(10);
    expect(OCR_MAINTENANCE_STATEMENT_MS).toBe(50);
    expect(OCR_MAINTENANCE_BATCH_MS).toBe(100);
    const { query, client } = fakeClient();
    expect(await detectExpiredOcr(client)).toBe(3);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]![0]).toBe("SET statement_timeout = '50ms'");
    expect(query.mock.calls[1]![0]).toContain(
      "public.ocr_detect_expired($1::integer)",
    );
    expect(query.mock.calls[1]![1]).toEqual([10]);
  });

  it.each([0, -1, 11, 1.5, NaN])(
    "rejects unbounded limits before SQL",
    async (limit) => {
      const { client, query } = fakeClient();
      await expect(detectExpiredOcr(client, limit)).rejects.toThrow();
      expect(query).not.toHaveBeenCalled();
    },
  );

  it("refuses an invalid SQL count and leaves source of truth in DB", async () => {
    const { client } = fakeClient(11);
    await expect(detectExpiredOcr(client)).rejects.toThrow();
  });

  it("closes only the dedicated maintenance connection on a stalled claim", async () => {
    vi.useFakeTimers();
    try {
      const query = vi
        .fn()
        .mockResolvedValueOnce({ rowCount: null, rows: [] })
        .mockImplementationOnce(() => new Promise(() => {}));
      const end = vi.fn(async () => undefined);
      const claim = detectExpiredOcr({
        query,
        end,
      } as unknown as OcrToolClient);
      const failed = expect(claim).rejects.toThrow("deadline");
      await vi.advanceTimersByTimeAsync(100);
      await failed;
      expect(end).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
