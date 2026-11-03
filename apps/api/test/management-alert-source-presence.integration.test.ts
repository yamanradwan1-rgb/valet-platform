import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import { queryPresenceReviewAlertCases } from "../src/modules/dashboard/management-alert-sources/presence-review-alert-reader";
import type { ManagementAlertReaderInput } from "../src/modules/dashboard/management-alert-sources/management-alert-source-contract";
import { pendingPresenceException } from "./shift-presence-exception-test-helper";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";

const db = new PresenceServerTestContext("414-alert-source-presence");
beforeAll(() => db.setup(), 120_000);
afterAll(() => db.teardown(), 120_000);

describe("Issue #414 ALT-12 reviewability for current principal", () => {
  it("projects only reviewable exact source IDs and retires upon review", async () => {
    const sample = await pendingPresenceException(db);
    const input: ManagementAlertReaderInput = {
      context: sample.manager.context,
      scope: {
        organizationId: sample.fixture.organizationId,
        locationId: sample.fixture.locationId,
        membershipId: sample.manager.membershipId,
      },
      limit: 21,
    };
    const read = () =>
      inPostgresTransaction(db.runtimePool, (tx) =>
        queryPresenceReviewAlertCases(tx, input),
      );
    expect(await read()).toMatchObject([
      {
        category: "ALT-12",
        severity: "IMPORTANT",
        sourceKind: "PRESENCE",
        sourceId: sample.exception.exceptionId,
        episodeId: sample.exception.exceptionId,
        title: "Presence exception requires review",
      },
    ]);
    await sample.approve();
    expect(await read()).toEqual([]);
  });

  it("excludes expired challenges and denies access after exact Location grant revocation", async () => {
    const sample = await pendingPresenceException(
      db,
      "START",
      "LOCATION_MANAGER",
    );
    const input: ManagementAlertReaderInput = {
      context: sample.manager.context,
      scope: {
        organizationId: sample.fixture.organizationId,
        locationId: sample.fixture.locationId,
        membershipId: sample.manager.membershipId,
      },
      limit: 21,
    };
    const read = () =>
      inPostgresTransaction(db.runtimePool, (tx) =>
        queryPresenceReviewAlertCases(tx, input),
      );
    expect((await read()).map((item) => item.sourceId)).toContain(
      String(sample.exception.exceptionId),
    );
    await db.adminPool.query(
      "UPDATE shift_presence_challenges SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
      [sample.challenge.challengeId],
    );
    expect(await read()).toEqual([]);
    await db.adminPool.query(
      "DELETE FROM membership_location_access WHERE membership_id=$1",
      [sample.manager.membershipId],
    );
    await expect(read()).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
  });
});
