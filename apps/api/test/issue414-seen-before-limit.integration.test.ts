import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import { DatabaseStaffSessionContextResolver } from "../src/modules/auth/staff-session-context";
import { authorizeSeenOccurrenceAudience } from "../src/modules/dashboard/management-alert-seen/management-alert-seen-authorization";
import { markManagementAlertOccurrenceSeen } from "../src/modules/dashboard/management-alert-seen/management-alert-seen-command";
import { unseenOccurrenceAntiJoin } from "../src/modules/dashboard/management-alert-seen/management-alert-seen-unseen-sql";
import { ManagementAuditTestFixture } from "./management-audit-test-fixture";

const db = new ManagementAuditTestFixture();
let runtime: Pool;
let resolver: DatabaseStaffSessionContextResolver;

beforeAll(async () => {
  await db.start();
  runtime = new Pool({ connectionString: process.env.DATABASE_URL });
  resolver = new DatabaseStaffSessionContextResolver(runtime);
}, 120_000);
afterAll(async () => {
  if (runtime) await runtime.end();
  await db.stop();
}, 60_000);

interface Reader {
  readonly context: Awaited<ReturnType<DatabaseStaffSessionContextResolver["resolve"]>>;
  readonly userId: string;
}

describe("Issue #414 Seen must be excluded at source before LIMIT 21 (PG17)", () => {
  it("returns 21 unseen of 23 events, with tenant/User isolation and no post-limit hole", async () => {
    const primary = await db.createUser();
    const { organizationId, membershipId } = await db.createMembership(primary.id);
    const { locationId } = await db.addLocation(organizationId);
    const second = await db.createUser();
    await db.addMembership(organizationId, second.id, "ORG_ADMIN");
    const login = async (user: typeof primary): Promise<Reader> => {
      const auth = await db.nativeLogin(user);
      await db.enrollAndAssure(auth);
      return {
        context: await resolver.resolve(`Bearer ${auth.accessToken}`),
        userId: user.id,
      };
    };
    const owner = await login(primary);
    const otherUser = await login(second);
    const target = await db.createUser();
    const targetMembership = await db.addMembership(
      organizationId, target.id, "VALET_EMPLOYEE",
    );
    const occurred = new Date(Date.now() - 60_000);
    const ids: string[] = [];
    for (let index = 0; index < 23; index += 1) {
      ids.push(await db.insertAuditEvent({
        organizationId,
        actorMembershipId: membershipId,
        eventType: "STAFF_ROLE_CHANGED",
        entityType: "OrganizationMembership",
        entityId: targetMembership,
        occurredAt: new Date(occurred.getTime() - index * 1_000),
        metadata: { previousRole: "VALET_EMPLOYEE", newRole: "VALET_SUPERVISOR" },
      }));
    }
    for (const id of ids.slice(0, 2)) {
      await markManagementAlertOccurrenceSeen(runtime, {
        context: owner.context,
        category: "ALT-15",
        locationId,
        sourceId: targetMembership,
        episodeId: id,
      });
    }

    const list = (reader: Reader, unseenOnly: boolean) =>
      inPostgresTransaction(runtime, async (transaction) => {
        const scope = await authorizeSeenOccurrenceAudience(transaction, {
          context: reader.context,
          category: "ALT-15",
          locationId,
        });
        const antiJoin = unseenOnly
          ? unseenOccurrenceAntiJoin("ALT-15", 3)
          : "";
        const result = await transaction.query<{ id: string }>(
          `SELECT event.id::text AS id
           FROM audit_events AS event
           WHERE event.organization_id = $1::uuid
             AND event.event_type = 'STAFF_ROLE_CHANGED'
             AND event.entity_type = 'OrganizationMembership'
             AND event.entity_id = $4::uuid
             ${antiJoin}
           ORDER BY event.occurred_at DESC, event.id DESC
           LIMIT $2`,
          [scope.organizationId, 21, scope.userId, targetMembership],
        );
        return result.rows.map((row) => row.id);
      });

    const ownerUnseen = await list(owner, true);
    expect(ownerUnseen).toHaveLength(21);
    expect(ownerUnseen).not.toContain(ids[0]);
    expect(ownerUnseen).not.toContain(ids[1]);
    expect(ownerUnseen).toContain(ids[22]);
    const otherUnseen = await list(otherUser, true);
    expect(otherUnseen).toHaveLength(21);
    expect(otherUnseen).toContain(ids[0]);
    expect(otherUnseen).toContain(ids[1]);

    // A post-LIMIT filter would have returned only 19, proving the regression.
    const wrong = await runtime.query<{ count: number }>(
      `WITH first_page AS (
         SELECT event.organization_id, event.id
         FROM audit_events AS event
         WHERE event.organization_id = $1 AND event.entity_id = $2
           AND event.event_type = 'STAFF_ROLE_CHANGED'
         ORDER BY event.occurred_at DESC, event.id DESC LIMIT 21
       )
       SELECT count(*)::int AS count FROM first_page AS event
       WHERE NOT EXISTS (
         SELECT 1 FROM management_alert_seen_receipts AS seen
         WHERE seen.organization_id = event.organization_id
           AND seen.user_id = $3 AND seen.category = 'ALT-15'
           AND seen.source_id = event.id
       )`,
      [organizationId, targetMembership, owner.userId],
    );
    expect(wrong.rows[0]?.count).toBe(19);
    expect(ownerUnseen).toHaveLength(21);
    expect(new Set(ownerUnseen).size).toBe(21);
  });
});
