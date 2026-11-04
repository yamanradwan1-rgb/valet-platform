import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DatabaseStaffSessionContextResolver } from "../src/modules/auth/staff-session-context";
import { markManagementAlertOccurrenceSeen } from "../src/modules/dashboard/management-alert-seen/management-alert-seen-command";
import { ManagementAuditTestFixture } from "./management-audit-test-fixture";

const fixture = new ManagementAuditTestFixture();
let runtime: Pool;
let sessions: DatabaseStaffSessionContextResolver;

beforeAll(async () => {
  await fixture.start();
  runtime = new Pool({ connectionString: process.env.DATABASE_URL });
  sessions = new DatabaseStaffSessionContextResolver(runtime);
}, 120_000);
afterAll(async () => {
  if (runtime) await runtime.end();
  await fixture.stop();
}, 60_000);

async function admin() {
  const user = await fixture.createUser();
  const { organizationId, membershipId } = await fixture.createMembership(user.id);
  const { locationId } = await fixture.addLocation(organizationId);
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  const context = await sessions.resolve(`Bearer ${auth.accessToken}`);
  return { context, user, organizationId, membershipId, locationId, auth };
}

async function staffOccurrence(
  actor: Awaited<ReturnType<typeof admin>>,
  input: { at?: Date; eventType?: string; metadata?: Record<string, unknown> } = {},
) {
  const target = await fixture.createUser();
  const targetId = await fixture.addMembership(
    actor.organizationId,
    target.id,
    "VALET_EMPLOYEE",
  );
  const episodeId = await fixture.insertAuditEvent({
    organizationId: actor.organizationId,
    actorMembershipId: actor.membershipId,
    eventType: input.eventType ?? "STAFF_ROLE_CHANGED",
    entityType: "OrganizationMembership",
    entityId: targetId,
    metadata: input.metadata ?? {
      previousRole: "VALET_EMPLOYEE",
      newRole: "VALET_SUPERVISOR",
      membershipVersion: 2,
    },
    ...(input.at === undefined ? {} : { occurredAt: input.at }),
  });
  return { sourceId: targetId, episodeId };
}

async function receiptCount(organizationId: string, userId: string) {
  const result = await fixture.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM management_alert_seen_receipts
     WHERE organization_id=$1 AND user_id=$2`,
    [organizationId, userId],
  );
  return result.rows[0]?.count;
}

function mark(
  actor: Awaited<ReturnType<typeof admin>>,
  category: "ALT-05" | "ALT-07" | "ALT-09" | "ALT-13" | "ALT-15",
  occurrence: { readonly sourceId: string; readonly episodeId: string },
  locationId = actor.locationId,
) {
  return markManagementAlertOccurrenceSeen(runtime, {
    context: actor.context,
    locationId,
    category,
    ...occurrence,
  });
}

describe("Issue #414 DEC-110 source-typed Seen receipts (PG17)", () => {
  it("converges concurrent ALT-15 same-User retries and preserves first timestamp", async () => {
    const actor = await admin();
    const occurrence = await staffOccurrence(actor);
    const [first, second] = await Promise.all([
      mark(actor, "ALT-15", occurrence),
      mark(actor, "ALT-15", occurrence),
    ]);
    expect(first).toEqual(second);
    expect(first.episodeId).toBe(occurrence.episodeId);
    expect(await receiptCount(actor.organizationId, actor.user.id)).toBe(1);
    expect(await mark(actor, "ALT-15", occurrence)).toEqual(first);
    const session = await fixture.sessionSnapshot(actor.auth.sessionId);
    expect(session.rows[0]?.last_admin_activity_at).not.toBeNull();
  });

  it("keeps other Users independent, and refuses foreign Org or wrong source/episode pairing", async () => {
    const actor = await admin();
    const other = await admin();
    const occurrence = await staffOccurrence(actor);
    await expect(mark(other, "ALT-15", occurrence)).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
    await expect(mark(actor, "ALT-15", {
      ...occurrence, sourceId: randomUUID(),
    })).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(await receiptCount(other.organizationId, other.user.id)).toBe(0);
    expect(await receiptCount(actor.organizationId, actor.user.id)).toBe(0);
    const second = await fixture.createUser();
    await fixture.addMembership(actor.organizationId, second.id, "ORG_ADMIN");
    const login = await fixture.nativeLogin(second);
    await fixture.enrollAndAssure(login);
    const context = await sessions.resolve(`Bearer ${login.accessToken}`);
    const own = await mark(actor, "ALT-15", occurrence);
    const another = await markManagementAlertOccurrenceSeen(runtime, {
      context, locationId: actor.locationId,
      category: "ALT-15", ...occurrence,
    });
    expect(another.episodeId).toBe(own.episodeId);
    expect(await receiptCount(actor.organizationId, actor.user.id)).toBe(1);
    expect(await receiptCount(actor.organizationId, second.id)).toBe(1);
  });

  it("rejects expired, future, unapproved staff events, and revoked retries without writes", async () => {
    const actor = await admin();
    const old = await staffOccurrence(actor, {
      at: new Date(Date.now() - 8 * 86_400_000),
    });
    const future = await staffOccurrence(actor, {
      at: new Date(Date.now() + 86_400_000),
    });
    const routine = await staffOccurrence(actor, {
      eventType: "STAFF_PROFILE_UPDATED",
    });
    for (const source of [old, future, routine]) {
      await expect(mark(actor, "ALT-15", source)).rejects.toMatchObject({
        code: "AUTHORIZATION_DENIED",
      });
    }
    expect(await receiptCount(actor.organizationId, actor.user.id)).toBe(0);
    const source = await staffOccurrence(actor);
    await mark(actor, "ALT-15", source);
    await fixture.query(
      `UPDATE organization_memberships SET status='INACTIVE'
       WHERE id=$1 AND organization_id=$2`,
      [actor.membershipId, actor.organizationId],
    );
    await expect(mark(actor, "ALT-15", source)).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
    expect(await receiptCount(actor.organizationId, actor.user.id)).toBe(1);
  });

  it("accepts ALT-13 exactly from an immutable force-end closure for an LM with exact grant", async () => {
    const actor = await admin();
    const lm = await fixture.createUser();
    const lmId = await fixture.addMembership(
      actor.organizationId, lm.id, "LOCATION_MANAGER",
    );
    await fixture.grantLocationAccess(actor.organizationId, lmId, actor.locationId);
    const lmAuth = await fixture.nativeLogin(lm);
    const context = await sessions.resolve(`Bearer ${lmAuth.accessToken}`);
    const shiftId = await fixture.startActiveShift(
      actor.organizationId, actor.locationId, lmId,
    );
    await fixture.endShift(shiftId);
    const operationId = randomUUID();
    const ended = await fixture.query<{ endedAt: Date }>(
      `SELECT ended_at AS "endedAt" FROM shifts WHERE id=$1`, [shiftId],
    );
    const endedAt = ended.rows[0]?.endedAt;
    if (!endedAt) throw new Error("Test Shift was not ended.");
    const reason = "Owner-approved administrative closure";
    const fingerprint = createHash("sha256").update(
      `staff-shift-force-end:v1\n${actor.organizationId}\n${shiftId}\nFORCE_END_SHIFT\n${reason}`,
    ).digest("hex");
    await fixture.query(
      `INSERT INTO shift_force_end_closures
         (shift_id, organization_id, actor_membership_id, operation_id,
          request_fingerprint, ended_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [shiftId, actor.organizationId, actor.membershipId, operationId, fingerprint, endedAt],
    );
    const episodeId = await fixture.insertAuditEvent({
      organizationId: actor.organizationId,
      actorMembershipId: actor.membershipId,
      locationId: actor.locationId,
      eventType: "SHIFT_FORCE_ENDED",
      entityType: "Shift",
      entityId: shiftId,
      occurredAt: endedAt,
      metadata: {
        fromStatus: "ACTIVE", toStatus: "ENDED",
        closureKind: "ADMIN_FORCE_END", cashReconciliationState: "PENDING",
        targetMembershipId: lmId, operationId, reason,
      },
    });
    const input = {
      context, locationId: actor.locationId, category: "ALT-13",
      sourceId: shiftId, episodeId,
    };
    expect((await markManagementAlertOccurrenceSeen(runtime, input)).episodeId)
      .toBe(episodeId);
    await fixture.query(
      `DELETE FROM membership_location_access WHERE membership_id=$1`, [lmId],
    );
    await expect(markManagementAlertOccurrenceSeen(runtime, input)).rejects
      .toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(await receiptCount(actor.organizationId, lm.id)).toBe(1);
  });

  it("enforces typed source FK and category one-of CHECK in PostgreSQL", async () => {
    const actor = await admin();
    const source = await staffOccurrence(actor);
    await expect(fixture.query(
      `INSERT INTO management_alert_seen_receipts
         (organization_id,user_id,category,source_id,occurrence_audit_event_id)
       VALUES ($1,$2,'ALT-05',$3,$3)`,
      [actor.organizationId, actor.user.id, source.episodeId],
    )).rejects.toMatchObject({ code: "23514" });
    await expect(fixture.query(
      `INSERT INTO management_alert_seen_receipts
         (organization_id,user_id,category,source_id,occurrence_audit_event_id)
       VALUES ($1,$2,'ALT-15',$3,$3)`,
      [actor.organizationId, actor.user.id, randomUUID()],
    )).rejects.toMatchObject({ code: "23503" });
    expect(await receiptCount(actor.organizationId, actor.user.id)).toBe(0);
  });

  it("keeps runtime Seen append-only and prevents spoofing server seen_at", async () => {
    const actor = await admin();
    const occurrence = await staffOccurrence(actor);
    const receipt = await mark(actor, "ALT-15", occurrence);
    await expect(runtime.query(
      `UPDATE management_alert_seen_receipts SET seen_at=clock_timestamp()
       WHERE organization_id=$1 AND user_id=$2`,
      [actor.organizationId, actor.user.id],
    )).rejects.toMatchObject({ code: "42501" });
    await expect(runtime.query(
      `DELETE FROM management_alert_seen_receipts
       WHERE organization_id=$1 AND user_id=$2`,
      [actor.organizationId, actor.user.id],
    )).rejects.toMatchObject({ code: "42501" });
    await expect(runtime.query(
      `INSERT INTO management_alert_seen_receipts
         (organization_id,user_id,category,source_id,occurrence_audit_event_id,seen_at)
       VALUES ($1,$2,'ALT-15',$3,$3,clock_timestamp())`,
      [actor.organizationId, actor.user.id, occurrence.episodeId],
    )).rejects.toMatchObject({ code: "42501" });
    expect(await mark(actor, "ALT-15", occurrence)).toEqual(receipt);
    expect(await receiptCount(actor.organizationId, actor.user.id)).toBe(1);
  });

  it("denies fabricated non-membership audit actor and malformed role metadata", async () => {
    const actor = await admin();
    const source = await staffOccurrence(actor);
    const synthetic = await fixture.insertAuditEvent({
      organizationId: actor.organizationId,
      actorType: "SYSTEM",
      eventType: "STAFF_ROLE_CHANGED",
      entityType: "OrganizationMembership",
      entityId: source.sourceId,
      metadata: { previousRole: "VALET_EMPLOYEE", newRole: "VALET_SUPERVISOR" },
    });
    const malformed = await fixture.insertAuditEvent({
      organizationId: actor.organizationId,
      actorMembershipId: actor.membershipId,
      eventType: "STAFF_ROLE_CHANGED",
      entityType: "OrganizationMembership",
      entityId: source.sourceId,
      metadata: { previousRole: 100, newRole: 200 },
    });
    for (const episodeId of [synthetic, malformed]) {
      await expect(mark(actor, "ALT-15", {
        sourceId: source.sourceId, episodeId,
      })).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    }
    expect(await receiptCount(actor.organizationId, actor.user.id)).toBe(0);
    expect((await mark(actor, "ALT-15", source)).episodeId).toBe(source.episodeId);
  });
});
