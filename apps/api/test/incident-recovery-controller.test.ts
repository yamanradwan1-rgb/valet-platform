import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { ApiOperationRunner } from "../src/common/http/api-operation-runner";
import type { ApiRequest } from "../src/common/http/api-request";
import { IncidentRecoveryController } from "../src/modules/incidents/incident-recovery.controller";
import type { IncidentRecoveryService } from "../src/modules/incidents/incident-recovery.service";

function setup() {
  const sessionId = randomUUID();
  const randomId = randomUUID();
  const incidentId = `${randomId.slice(0, 14)}8${randomId.slice(15)}`;
  const userId = randomUUID();
  const recover = vi.fn().mockResolvedValue({
    incidentId,
    outcome: "UNKNOWN",
    sessionId,
  });
  const resolve = vi.fn().mockResolvedValue({ userId });
  const runner = new ApiOperationRunner({ now: () => 1 }, { observe: vi.fn() });
  const controller = new IncidentRecoveryController(
    { recover } as unknown as IncidentRecoveryService,
    runner,
    { resolve },
  );
  const request: ApiRequest = {
    headers: { authorization: "Bearer synthetic" },
    rawHeaders: ["Authorization", "Bearer synthetic"],
    requestId: "incident-read-test",
  };
  return {
    call: (body?: unknown) =>
      controller.recover(
        request,
        "Bearer synthetic",
        { incidentId, sessionId },
        {},
        body,
      ),
    recover,
    resolve,
  };
}

describe("DEC-077 canonical Incident recovery GET transport", () => {
  it("rejects nonempty request bodies before authorization or a database read", async () => {
    const scope = setup();
    for (const body of [{ unexpected: "value" }, ["value"], "value"]) {
      await expect(scope.call(body)).rejects.toMatchObject({ status: 400 });
    }
    expect(scope.resolve).not.toHaveBeenCalled();
    expect(scope.recover).not.toHaveBeenCalled();
  });

  it("continues to allow bodyless GET and an empty JSON object", async () => {
    const scope = setup();
    await expect(scope.call()).resolves.toMatchObject({ outcome: "UNKNOWN" });
    await expect(scope.call({})).resolves.toMatchObject({ outcome: "UNKNOWN" });
    expect(scope.resolve).toHaveBeenCalledTimes(2);
    expect(scope.recover).toHaveBeenCalledTimes(2);
  });
});
