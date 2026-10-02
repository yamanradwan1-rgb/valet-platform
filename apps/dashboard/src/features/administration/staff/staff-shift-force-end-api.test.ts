import { describe, expect, it, vi } from "vitest";
import { staffShiftHistoryDetailSchema } from "@valet/contracts";
import { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { forceEndShift } from "./staff-shift-force-end-api";

const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const target = staffShiftHistoryDetailSchema.parse({
  shiftId: id(1),
  membershipId: id(2),
  identity: {
    firstName: "ليلى",
    lastName: "Smith",
    email: "fixture@example.test",
  },
  currentRole: "VALET_EMPLOYEE",
  location: {
    locationId: id(3),
    name: "Fixture",
    code: "FIX",
    timezone: "Asia/Amman",
  },
  status: "ACTIVE",
  startedAt: "2026-10-02T05:00:00Z",
  endedAt: null,
});
const request = {
  operationId: id(4),
  confirmation: "FORCE_END_SHIFT" as const,
  reason: "  سبب  ",
};
const result = {
  operationId: id(4),
  shiftId: id(1),
  membershipId: id(2),
  locationId: id(3),
  status: "ENDED",
  startedAt: target.startedAt,
  endedAt: "2026-10-02T08:00:00Z",
  closureKind: "ADMIN_FORCE_END",
  cashReconciliationState: "PENDING",
};
function setup(payload: unknown) {
  const fetcher = vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify(payload)),
  );
  const api = new DashboardApiClient({
    fetch: fetcher,
    auth: {
      getAccessToken: () => "synthetic",
      getIdentityGeneration: () => 1,
      getSessionGeneration: () => 1,
      isTokenFresh: () => true,
      refresh: vi.fn(),
    },
  });
  return { api, fetcher };
}
describe("Force End API boundary", () => {
  it("makes one authenticated no-store POST with shared normalized strict input", async () => {
    const { api, fetcher } = setup(result);
    expect(await forceEndShift(api, id(5), target, request)).toEqual(result);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(
      `/v1/staff/management/organizations/${id(5)}/shifts/${id(1)}/force-end`,
    );
    expect(init).toMatchObject({
      method: "POST",
      cache: "no-store",
      credentials: "include",
    });
    expect(JSON.parse(init!.body as string)).toEqual({
      ...request,
      reason: "سبب",
    });
  });
  it.each(["operationId", "shiftId", "membershipId", "locationId"])(
    "rejects a parsed but mismatched %s as unknown response",
    async (field) => {
      const { api, fetcher } = setup({ ...result, [field]: id(99) });
      await expect(
        forceEndShift(api, id(5), target, request),
      ).rejects.toMatchObject({ code: "MALFORMED_RESPONSE" });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it("rejects invalid input before dispatch", async () => {
    const { api, fetcher } = setup(result);
    await expect(
      forceEndShift(api, id(5), target, { ...request, reason: " " }),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
