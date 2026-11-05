import { vi } from "vitest";
import type { PostgresPool } from "../src/common/database/postgres";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import { PlateOcrCostGuard } from "../src/modules/check-in-api/plate-ocr-cost-guard";
import { readPlateOcrConfig } from "../src/modules/check-in-api/plate-ocr-config";
import { PlateOcrService } from "../src/modules/check-in-api/plate-ocr.service";
import { PlateRecognizerSnapshotProvider } from "../src/modules/check-in-api/plate-recognizer-snapshot.provider";

const authority = vi.hoisted(() => ({
  session: vi.fn(),
  location: vi.fn(),
  shift: vi.fn(),
}));
export { authority };
vi.mock("../src/modules/auth/staff-session-revalidation", () => ({
  lockAndRecheckStaffSessionContext: authority.session,
}));
vi.mock("../src/modules/check-in-api/check-in-location-authorization", () => ({
  authorizeCheckInLocation: authority.location,
}));
vi.mock("../src/modules/shifts/shift-operational-eligibility", () => ({
  lockShiftOperationalEligibility: authority.shift,
}));

export const session: StaffSessionContext = {
  accessTokenHash: "test-access-hash",
  staffAuthSessionId: "11111111-1111-4111-8111-111111111111",
  createdAt: new Date("2026-11-05T10:00:00.000Z"),
  userId: "22222222-2222-4222-8222-222222222222",
};
export const input = {
  targetLocationId: "33333333-3333-4333-8333-333333333333",
  plateCountry: "JO" as const,
};
export const image = new Uint8Array([255, 216, 255, 217]);
export const scope = {
  organizationId: "55555555-5555-4555-8555-555555555555",
  locationId: input.targetLocationId,
  actor: { membershipId: "66666666-6666-4666-8666-666666666666" },
};
export const config = readPlateOcrConfig({
  NODE_ENV: "production",
  PLATE_OCR_ENDPOINT: "https://api.platerecognizer.com/v1/plate-reader/",
  PLATE_OCR_TOKEN: "test-only-secret",
  PLATE_OCR_MIN_SCORE: "0.8",
  PLATE_OCR_TIMEOUT_MS: "100",
})!;

export function setup(
  http: typeof fetch,
  options: { enabled?: boolean; configured?: boolean } = {},
) {
  const query = vi.fn(async (sql: string) => ({
    rowCount: sql.includes("COALESCE") ? 1 : 0,
    rows: sql.includes("COALESCE")
      ? [{ enabled: options.enabled ?? true }]
      : [],
  }));
  const release = vi.fn();
  const pool = {
    connect: vi.fn(async () => ({ query, release })),
  } as unknown as PostgresPool;
  const cost = new PlateOcrCostGuard("production", () => performance.now());
  const provider = new PlateRecognizerSnapshotProvider(
    options.configured === false ? undefined : config,
    http,
  );
  const service = new PlateOcrService(pool, cost, provider);
  return { service, pool, query, release, http };
}
