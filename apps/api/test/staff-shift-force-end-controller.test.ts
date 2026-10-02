import { randomUUID } from "node:crypto";
import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { ApiOperationRunner } from "../src/common/http/api-operation-runner";
import type { ApiRequest } from "../src/common/http/api-request";
import { StaffShiftForceEndController } from "../src/modules/management/staff-shift-force-end.controller";
import { StaffShiftForceEndService } from "../src/modules/management/staff-shift-force-end.service";
import { throwStaffShiftForceEndDatabaseError } from "../src/modules/management/staff-shift-force-end-errors";

function setup() {
  const organizationId = randomUUID(),
    shiftId = randomUUID();
  const reason = "سبب <script>secret observer sentinel</script>";
  const command = {
    operationId: randomUUID(),
    confirmation: "FORCE_END_SHIFT",
    reason,
  };
  const result = {
    operationId: command.operationId,
    shiftId,
    membershipId: randomUUID(),
    locationId: randomUUID(),
    status: "ENDED",
    startedAt: new Date(0).toISOString(),
    endedAt: new Date().toISOString(),
    closureKind: "ADMIN_FORCE_END",
    cashReconciliationState: "PENDING",
  };
  const execute = vi.fn().mockResolvedValue(result);
  const resolve = vi.fn().mockResolvedValue({
    userId: randomUUID(),
    staffAuthSessionId: randomUUID(),
  });
  const observe = vi.fn();
  const runner = new ApiOperationRunner({ now: () => 1 }, { observe });
  const service = { execute } as unknown as StaffShiftForceEndService;
  const controller = new StaffShiftForceEndController(service, runner, {
    resolve,
  });
  const request: ApiRequest = {
    headers: { authorization: "Bearer synthetic" },
    rawHeaders: ["Authorization", "Bearer synthetic"],
    requestId: "safe-request",
  };
  const setHeader = vi.fn();
  const call = (body: unknown = command, query: unknown = {}, req = request) =>
    controller.execute(
      req,
      "Bearer synthetic",
      organizationId,
      shiftId,
      body,
      query,
      { setHeader },
    );
  return {
    call,
    command,
    execute,
    observe,
    reason,
    request,
    resolve,
    setHeader,
  };
}

describe("T05-F transport and reason observability boundary", () => {
  it("emits bounded measurement and no-store headers without command text", async () => {
    const s = setup();
    const result = await s.call();
    expect(result).not.toHaveProperty("reason");
    expect(s.observe).toHaveBeenCalledWith({
      durationMs: 0,
      operation: "STAFF_SHIFT_FORCE_END",
      outcome: "SUCCESS",
      requestId: "safe-request",
    });
    expect(s.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      expect.stringContaining("no-store"),
    );
    expect(JSON.stringify(s.observe.mock.calls)).not.toContain(s.reason);
  });

  it("discards raw SQL error detail/context before errors and measurements", async () => {
    const s = setup();
    s.execute.mockImplementation(async () =>
      throwStaffShiftForceEndDatabaseError({
        code: "23514",
        message: s.reason,
        detail: s.reason,
        where: s.reason,
      }),
    );
    let caught: unknown;
    try {
      await s.call();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(HttpException);
    expect((caught as HttpException).getStatus()).toBe(500);
    expect(
      JSON.stringify((caught as HttpException).getResponse()),
    ).not.toContain(s.reason);
    expect(JSON.stringify(s.observe.mock.calls)).not.toContain(s.reason);
    expect(s.observe).toHaveBeenCalledWith({
      durationMs: 0,
      errorCode: "INTERNAL_ERROR",
      operation: "STAFF_SHIFT_FORCE_END",
      outcome: "ERROR",
      requestId: "safe-request",
    });
  });

  it.each([
    undefined,
    [],
    ["Authorization", "Bearer a", "authorization", "Bearer b"],
    ["Authorization"],
  ])(
    "rejects absent/duplicate/malformed authorization before service",
    async (rawHeaders) => {
      const s = setup();
      const request: ApiRequest = { headers: s.request.headers };
      if (rawHeaders !== undefined) Object.assign(request, { rawHeaders });
      await expect(s.call(s.command, {}, request)).rejects.toMatchObject({
        status: 401,
      });
      expect(s.resolve).not.toHaveBeenCalled();
      expect(s.execute).not.toHaveBeenCalled();
    },
  );
});
