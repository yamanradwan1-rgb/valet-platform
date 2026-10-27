import { describe, expect, it } from "vitest";
import { createIntakeSessionCommandExecutor } from "../src/modules/valet-sessions/intake-session-command";
import { useIntakeSessionCommandTestHarness } from "./intake-session-command-test-harness";
import {
  abortIntakeCommits,
  observeIntakeQueries,
} from "./intake-serialization-test-pool";
import {
  configureVerifiedIssuance,
  readIssuedRows,
  verifiedIssuanceHook,
} from "./whatsapp-issuance-fixture";

const harness = useIntakeSessionCommandTestHarness();
const empty = {
  audits: 0,
  customers: 0,
  intakeOperations: 0,
  sessions: 0,
  vehicles: 0,
};

describe("Intake bounded serialization recovery", () => {
  it("recovers after three real server aborts with one atomic intake and outbox", async () => {
    const scope = await harness.createFixture();
    const phone = "+962790000081";
    await configureVerifiedIssuance(harness.adminPool, scope, phone);
    expect(verifiedIssuanceHook).not.toBeNull();
    let rollbacks = 0;
    const fault = abortIntakeCommits(harness.runtimePool, 3, async () => {
      rollbacks += 1;
      expect(await harness.readCounts(scope.organizationId)).toEqual(empty);
      for (const table of [
        "tasks",
        "outbound_message_intents",
        "outbound_message_deliveries",
        "outbound_message_envelopes",
      ])
        expect(
          (
            await harness.adminPool.query(
              `SELECT count(*)::int AS count FROM ${table} WHERE organization_id=$1`,
              [scope.organizationId],
            )
          ).rows[0]?.count,
        ).toBe(0);
    });
    const execute = createIntakeSessionCommandExecutor(fault.pool, {
      initialGuestIssuance: verifiedIssuanceHook!,
    });
    const request = harness.temporaryRequest(scope, {
      customer: { intent: "DIFFERENT_CUSTOMER", phone },
    });
    const result = await execute(request);
    expect(fault.attempts()).toBe(4);
    expect(fault.codes).toEqual(["40001", "40001", "40001"]);
    expect(rollbacks).toBe(3);
    expect(await harness.readCounts(scope.organizationId)).toEqual({
      audits: 2,
      customers: 1,
      intakeOperations: 1,
      sessions: 1,
      vehicles: 1,
    });
    const issued = await readIssuedRows(
      harness.adminPool,
      result.valetSessionId,
    );
    expect(issued.session?.customer_access_generation).toBe(1);
    expect(issued.intents).toHaveLength(1);
    expect(issued.deliveries).toHaveLength(1);
    expect(issued.envelopes).toHaveLength(1);
    expect(await execute(request)).toEqual(result);
    expect(
      (await readIssuedRows(harness.adminPool, result.valetSessionId)).intents,
    ).toHaveLength(1);
  });

  it("returns the existing conflict after five aborts with no durable effects", async () => {
    const scope = await harness.createFixture();
    const fault = abortIntakeCommits(harness.runtimePool, 20);
    await expect(
      createIntakeSessionCommandExecutor(fault.pool)(
        harness.temporaryRequest(scope),
      ),
    ).rejects.toMatchObject({ code: "INTAKE_CONCURRENCY_CONFLICT" });
    expect(fault.attempts()).toBe(5);
    expect(fault.codes).toEqual(Array(5).fill("40001"));
    expect(await harness.readCounts(scope.organizationId)).toEqual(empty);
  });

  it.each(["ACCESS_REVOKED", "INTAKE_STOPPED"])(
    "reauthorizes after rollback and denies %s on retry",
    async (reason) => {
      const scope = await harness.createFixture();
      const fault = abortIntakeCommits(harness.runtimePool, 1, async () => {
        if (reason === "ACCESS_REVOKED")
          await harness.adminPool.query(
            "DELETE FROM membership_location_access WHERE membership_id=$1",
            [scope.membershipId],
          );
        else
          await harness.adminPool.query(
            "UPDATE locations SET accepting_intake=FALSE WHERE id=$1",
            [scope.locationId],
          );
      });
      await expect(
        createIntakeSessionCommandExecutor(fault.pool)(
          harness.temporaryRequest(scope),
        ),
      ).rejects.toMatchObject({
        code:
          reason === "ACCESS_REVOKED"
            ? "LOCATION_ACCESS_DENIED"
            : "LOCATION_INTAKE_STOPPED",
      });
      expect(fault.attempts()).toBe(2);
      expect(await harness.readCounts(scope.organizationId)).toEqual(empty);
    },
  );

  it("never retries an acknowledged commit whose response is lost", async () => {
    const scope = await harness.createFixture();
    let commits = 0;
    const pool = observeIntakeQueries(harness.runtimePool, async (sql, run) => {
      const result = await run();
      if (sql === "COMMIT") {
        commits += 1;
        throw Object.assign(new Error("controlled lost acknowledgement"), {
          code: "ECONNRESET",
        });
      }
      return result;
    });
    await expect(
      createIntakeSessionCommandExecutor(pool)(harness.temporaryRequest(scope)),
    ).rejects.toMatchObject({ code: "ECONNRESET" });
    expect(commits).toBe(1);
    expect(await harness.readCounts(scope.organizationId)).toEqual({
      audits: 1,
      customers: 0,
      intakeOperations: 1,
      sessions: 1,
      vehicles: 1,
    });
  });
});
