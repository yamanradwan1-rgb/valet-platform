import { performance } from "node:perf_hooks";
import { OcrToolError, type OcrToolClient } from "./restricted-connection";

export const OCR_MAINTENANCE_INTERVAL_MS = 30000;
export const OCR_MAINTENANCE_BATCH_LIMIT = 10;
export const OCR_MAINTENANCE_STATEMENT_MS = 50;
export const OCR_MAINTENANCE_BATCH_MS = 100;

/**
 * Execute once under maintenance-only DB credentials from an off-path scheduler.
 * SQL owns nonblocking advisory and SKIP LOCKED claims. This is not Check-In work.
 */
export async function detectExpiredOcr(
  client: OcrToolClient,
  limit = OCR_MAINTENANCE_BATCH_LIMIT,
): Promise<number> {
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > OCR_MAINTENANCE_BATCH_LIMIT
  ) {
    throw new OcrToolError("Invalid bounded maintenance batch size.");
  }
  return new Promise<number>((resolve, reject) => {
    const started = performance.now();
    const timeout = setTimeout(() => {
      // Close this dedicated maintenance connection; never touch the API pool.
      void client.end().catch(() => undefined);
      reject(new OcrToolError("OCR maintenance batch exceeded its deadline."));
    }, OCR_MAINTENANCE_BATCH_MS);
    void (async () => {
      await client.query(
        `SET statement_timeout = '${OCR_MAINTENANCE_STATEMENT_MS}ms'`,
      );
      const result = await client.query<{ detected: number }>(
        "SELECT public.ocr_detect_expired($1::integer) AS detected",
        [limit],
      );
      const detected = result.rows[0]?.detected;
      if (
        result.rowCount !== 1 ||
        typeof detected !== "number" ||
        !Number.isInteger(detected) ||
        detected < 0 ||
        detected > limit ||
        performance.now() - started > OCR_MAINTENANCE_BATCH_MS
      ) {
        throw new OcrToolError("OCR maintenance batch was not safely bounded.");
      }
      return detected;
    })().then(
      (detected) => {
        clearTimeout(timeout);
        resolve(detected);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}
