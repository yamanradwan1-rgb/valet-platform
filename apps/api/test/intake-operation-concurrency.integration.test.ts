import { describe, expect, it } from "vitest";
import { createIntakeSessionCommandExecutor } from "../src/modules/valet-sessions/intake-session-command";
import { useIntakeSessionCommandTestHarness } from "./intake-session-command-test-harness";

const harness = useIntakeSessionCommandTestHarness();
describe("Intake idempotency and genuine vehicle competition", () => {
  it("converges eight concurrent identical operations to one committed result", async () => {
    const scope = await harness.createFixture();
    const execute = createIntakeSessionCommandExecutor(harness.runtimePool);
    const request = harness.temporaryRequest(scope);
    const results = await Promise.all(
      Array.from({ length: 8 }, () => execute(request)),
    );
    for (const result of results) expect(result).toEqual(results[0]);
    expect(await harness.readCounts(scope.organizationId)).toEqual({
      audits: 1,
      customers: 0,
      intakeOperations: 1,
      sessions: 1,
      vehicles: 1,
    });
    await expect(
      execute({
        ...request,
        vehicleIdentity: {
          mode: "TEMPORARY_DESCRIPTOR",
          temporaryDescriptor: "different material",
        },
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect((await harness.readCounts(scope.organizationId)).sessions).toBe(1);
  });

  it("keeps one custody winner and seven genuine same-vehicle conflicts", async () => {
    const scope = await harness.createFixture();
    const execute = createIntakeSessionCommandExecutor(harness.runtimePool);
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => execute(harness.confirmedRequest(scope))),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const failures = results.filter((result) => result.status === "rejected");
    expect(failures).toHaveLength(7);
    for (const failure of failures)
      expect((failure as PromiseRejectedResult).reason).toMatchObject({
        code: "ACTIVE_VALET_SESSION_CONFLICT",
      });
    expect(await harness.readCounts(scope.organizationId)).toEqual({
      audits: 1,
      customers: 0,
      intakeOperations: 1,
      sessions: 1,
      vehicles: 1,
    });
  });
});
