import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import { queryPresenceReviewAlertCases } from "../src/modules/dashboard/management-alert-sources/presence-review-alert-reader";
import { readManagementPresenceException } from "../src/modules/management/presence-management-exception";
import { pendingPresenceException } from "./shift-presence-exception-test-helper";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";

const db = new PresenceServerTestContext("414-alert-presence-source-parity");
beforeAll(() => db.setup(), 120_000);
afterAll(() => db.teardown(), 120_000);

type Sample = Awaited<ReturnType<typeof pendingPresenceException>>;

async function expectCanonicalReviewability(sample: Sample, expected: boolean) {
  const id = String(sample.exception.exceptionId);
  const scope = {
    organizationId: sample.fixture.organizationId,
    locationId: sample.fixture.locationId,
    membershipId: sample.manager.membershipId,
  };
  const result = await inPostgresTransaction(db.runtimePool, async (tx) => {
    const source = await readManagementPresenceException(
      tx,
      {
        ...scope,
        userId: sample.manager.userId,
      },
      id,
    );
    const cases = await queryPresenceReviewAlertCases(tx, {
      context: sample.manager.context,
      scope,
      limit: 21,
    });
    return { source, cases };
  });
  expect(result.source.canReview).toBe(expected);
  expect(result.cases.some((item) => item.sourceId === id)).toBe(expected);
}

describe("Issue #414 ALT-12 exact equivalence to source-owned canReview", () => {
  it("START needs the requester Location grant and ACTIVE membership", async () => {
    const grant = await pendingPresenceException(
      db,
      "START",
      "LOCATION_MANAGER",
    );
    await expectCanonicalReviewability(grant, true);
    await db.adminPool.query(
      "DELETE FROM membership_location_access WHERE membership_id=$1 AND location_id=$2",
      [grant.fixture.membershipId, grant.fixture.locationId],
    );
    await expectCanonicalReviewability(grant, false);

    const inactive = await pendingPresenceException(
      db,
      "START",
      "LOCATION_MANAGER",
    );
    await expectCanonicalReviewability(inactive, true);
    await db.adminPool.query(
      "UPDATE organization_memberships SET status='INACTIVE' WHERE id=$1",
      [inactive.fixture.membershipId],
    );
    await expectCanonicalReviewability(inactive, false);
  });

  it("END remains reviewable with an ACTIVE Shift even after requester grant/status loss", async () => {
    const sample = await pendingPresenceException(
      db,
      "END",
      "LOCATION_MANAGER",
    );
    await expectCanonicalReviewability(sample, true);
    await db.adminPool.query(
      "DELETE FROM membership_location_access WHERE membership_id=$1 AND location_id=$2",
      [sample.fixture.membershipId, sample.fixture.locationId],
    );
    await db.adminPool.query(
      "UPDATE organization_memberships SET status='INACTIVE' WHERE id=$1",
      [sample.fixture.membershipId],
    );
    await expectCanonicalReviewability(sample, true);
    await db.adminPool.query(
      "UPDATE shifts SET status='ENDED',ended_at=clock_timestamp() WHERE id=$1",
      [sample.shiftId],
    );
    await expectCanonicalReviewability(sample, false);
  });

  it("the same exception is never self-reviewable for its requesting User", async () => {
    const sample = await pendingPresenceException(
      db,
      "START",
      "LOCATION_MANAGER",
    );
    await expectCanonicalReviewability(sample, true);
    // The source predicate itself is viewer-specific; a requester cannot also
    // hold LM membership in this tenant (unique Organization/User membership).
    const source = await inPostgresTransaction(db.runtimePool, (tx) =>
      readManagementPresenceException(
        tx,
        {
          organizationId: sample.fixture.organizationId,
          locationId: sample.fixture.locationId,
          membershipId: sample.fixture.membershipId,
          userId: sample.fixture.userId,
        },
        String(sample.exception.exceptionId),
      ),
    );
    expect(source.canReview).toBe(false);
  });

  it("a disabled requesting User loses reviewability before the source LIMIT", async () => {
    const sample = await pendingPresenceException(
      db,
      "START",
      "LOCATION_MANAGER",
    );
    await expectCanonicalReviewability(sample, true);
    await db.adminPool.query("UPDATE users SET status='DISABLED' WHERE id=$1", [
      sample.fixture.userId,
    ]);
    await expectCanonicalReviewability(sample, false);
  });
});
