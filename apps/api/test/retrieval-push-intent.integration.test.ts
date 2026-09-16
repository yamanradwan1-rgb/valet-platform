import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { RetrievalPushTestContext } from "./retrieval-push-test-context";
import { syntheticStaffPushPolicy } from "./staff-push-policy-test-value";

const context = new RetrievalPushTestContext("intent");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("MOB-020C retrieval Push intent transaction", () => {
  it("keeps canonical Retrieval available when Push creation is disabled", async () => {
    const fixture = await context.createGuestParkedFixture();
    await context.addRegistration(fixture.userId);
    await context.request(
      fixture,
      syntheticStaffPushPolicy.employeeRetrievalRequested,
      false,
    );
    expect(await context.retrievalEffects(fixture.sessionId)).toEqual({
      audit_count: 1,
      delivery_count: 0,
      dispatch_count: 1,
      intent_count: 0,
      request_count: 1,
      session_state: "REQUESTED",
      task_count: 1,
    });
  });

  it("honors effective tenant retrieval-notification policy without rewriting history", async () => {
    const companyOff = await context.createGuestParkedFixture();
    await context.addRegistration(companyOff.userId);
    await context.adminPool.query(
      `UPDATE organizations
       SET employee_retrieval_requested_notification_enabled = false
       WHERE id = $1`,
      [companyOff.organizationId],
    );
    await context.request(companyOff);
    expect(await context.retrievalEffects(companyOff.sessionId)).toMatchObject({
      delivery_count: 0,
      intent_count: 0,
      request_count: 1,
      session_state: "REQUESTED",
      task_count: 1,
    });

    const locationOn = await context.createGuestParkedFixture();
    await context.addRegistration(locationOn.userId);
    await context.adminPool.query(
      `UPDATE organizations
       SET employee_retrieval_requested_notification_enabled = false
       WHERE id = $1`,
      [locationOn.organizationId],
    );
    await context.adminPool.query(
      `UPDATE locations
       SET employee_retrieval_requested_notification_enabled_override = true
       WHERE id = $1`,
      [locationOn.locationId],
    );
    await context.request(locationOn);
    const created = await context.retrievalEffects(locationOn.sessionId);
    expect(created).toMatchObject({ delivery_count: 1, intent_count: 1 });
    await context.adminPool.query(
      `UPDATE locations
       SET employee_retrieval_requested_notification_enabled_override = false
       WHERE id = $1`,
      [locationOn.locationId],
    );
    expect(await context.retrievalEffects(locationOn.sessionId)).toEqual(created);

    const locationOff = await context.createGuestParkedFixture();
    await context.addRegistration(locationOff.userId);
    await context.adminPool.query(
      `UPDATE locations
       SET employee_retrieval_requested_notification_enabled_override = false
       WHERE id = $1`,
      [locationOff.locationId],
    );
    await context.request(locationOff);
    expect(await context.retrievalEffects(locationOff.sessionId)).toMatchObject({
      delivery_count: 0,
      intent_count: 0,
    });
  });
  it("commits the canonical domain lifecycle and one intent with zero recipients", async () => {
    const fixture = await context.createGuestParkedFixture();
    const result = await context.request(fixture);
    expect(result).toMatchObject({
      state: "REQUESTED",
      valetSessionId: fixture.sessionId,
      version: 5,
    });
    expect(await context.retrievalEffects(fixture.sessionId)).toEqual({
      audit_count: 1,
      delivery_count: 0,
      dispatch_count: 1,
      intent_count: 1,
      request_count: 1,
      session_state: "REQUESTED",
      task_count: 1,
    });
    const projection = await context.adminPool.query<{
      assignee: string | null;
      attempt_count: number | null;
      created_at: Date;
      expires_at: Date;
      kind: string;
      location_id: string;
      max_attempts: number | null;
      next_attempt_at: Date | null;
      organization_id: string;
      policy_version: number;
      status: string;
      task_id: string;
      task_type: string;
      valet_session_id: string;
    }>(
      `SELECT task.task_type::text, task.status::text,
              task.current_assignee_membership_id::text AS assignee,
              intent.kind::text, intent.policy_version, intent.created_at,
              intent.expires_at, intent.organization_id::text,
              intent.location_id::text, intent.valet_session_id::text,
              intent.task_id::text, delivery.attempt_count,
              delivery.max_attempts, delivery.next_attempt_at
       FROM staff_push_intents AS intent
       INNER JOIN tasks AS task ON task.id = intent.task_id
       LEFT JOIN staff_push_deliveries AS delivery ON delivery.intent_id = intent.id
       WHERE intent.valet_session_id = $1`,
      [fixture.sessionId],
    );
    const intent = projection.rows[0]!;
    expect(intent).toMatchObject({
      assignee: null,
      attempt_count: null,
      kind: "EMPLOYEE_RETRIEVAL_REQUESTED",
      location_id: fixture.locationId,
      max_attempts: null,
      next_attempt_at: null,
      organization_id: fixture.organizationId,
      policy_version:
        syntheticStaffPushPolicy.employeeRetrievalRequested.policyVersion,
      status: "QUEUED",
      task_type: "RETRIEVAL",
      valet_session_id: fixture.sessionId,
    });
    expect(intent.task_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(intent.expires_at.getTime() - intent.created_at.getTime()).toBe(
      syntheticStaffPushPolicy.employeeRetrievalRequested.intentTtlSeconds *
        1_000,
    );
  });

  it("creates one PENDING delivery for an eligible valet", async () => {
    const fixture = await context.createGuestParkedFixture();
    const registration = await context.addRegistration(fixture.userId);
    await context.request(fixture);
    expect(await context.deliveryRegistrationIds(fixture.sessionId)).toEqual([
      registration.registrationId,
    ]);
    const result = await context.adminPool.query<{
      attempt_count: number;
      created_at: Date;
      intent_created_at: Date;
      lease_expires_at: Date | null;
      lease_token: string | null;
      max_attempts: number;
      next_attempt_at: Date;
      provider_accepted_at: Date | null;
      provider_reference: string | null;
      provider_result_class: string | null;
      recipient_membership_id: string;
      state: string;
      terminal_at: Date | null;
      updated_at: Date;
    }>(
      `SELECT delivery.state::text, delivery.attempt_count,
              delivery.max_attempts, delivery.next_attempt_at,
              delivery.created_at, delivery.updated_at,
              intent.created_at AS intent_created_at,
              delivery.recipient_membership_id::text,
              delivery.lease_token::text, delivery.lease_expires_at,
              delivery.provider_result_class::text,
              delivery.provider_reference, delivery.provider_accepted_at,
              delivery.terminal_at
       FROM staff_push_deliveries AS delivery
       INNER JOIN staff_push_intents AS intent ON intent.id = delivery.intent_id
       WHERE intent.valet_session_id = $1`,
      [fixture.sessionId],
    );
    expect(result.rows[0]).toMatchObject({
      attempt_count: 0,
      lease_expires_at: null,
      lease_token: null,
      max_attempts:
        syntheticStaffPushPolicy.employeeRetrievalRequested.maxAttempts,
      provider_accepted_at: null,
      provider_reference: null,
      provider_result_class: null,
      recipient_membership_id: fixture.membershipId,
      state: "PENDING",
      terminal_at: null,
    });
    expect(result.rows[0]!.next_attempt_at).toEqual(result.rows[0]!.created_at);
    expect(result.rows[0]!.updated_at).toEqual(result.rows[0]!.created_at);
    expect(result.rows[0]!.intent_created_at).toEqual(
      result.rows[0]!.created_at,
    );
  });

  it("includes accepted supervisors and all eligible staff registrations", async () => {
    const fixture = await context.createGuestParkedFixture();
    const valet = await context.addRegistration(fixture.userId);
    const supervisor = await context.addMember(fixture, "VALET_SUPERVISOR");
    const supervisorRegistration = await context.addRegistration(
      supervisor.userId,
    );
    await context.request(fixture);
    expect(await context.deliveryRegistrationIds(fixture.sessionId)).toEqual(
      [valet.registrationId, supervisorRegistration.registrationId].sort(),
    );
  });

  it("creates exactly two deliveries for two eligible valet employees", async () => {
    const fixture = await context.createGuestParkedFixture();
    const first = await context.addRegistration(fixture.userId);
    const secondEmployee = await context.addMember(fixture);
    const second = await context.addRegistration(secondEmployee.userId);
    await context.request(fixture);
    expect(await context.deliveryRegistrationIds(fixture.sessionId)).toEqual(
      [first.registrationId, second.registrationId].sort(),
    );
    expect(await context.retrievalEffects(fixture.sessionId)).toMatchObject({
      delivery_count: 2,
      intent_count: 1,
      task_count: 1,
    });
  });

  it("fans out once per eligible device/session registration", async () => {
    const fixture = await context.createGuestParkedFixture();
    const first = await context.addRegistration(fixture.userId);
    const second = await context.addRegistration(fixture.userId);
    await context.request(fixture);
    expect(await context.deliveryRegistrationIds(fixture.sessionId)).toEqual(
      [first.registrationId, second.registrationId].sort(),
    );
    expect(await context.retrievalEffects(fixture.sessionId)).toMatchObject({
      delivery_count: 2,
      intent_count: 1,
      task_count: 1,
    });
  });

  it("does not require the short access-token window for endpoint eligibility", async () => {
    const fixture = await context.createGuestParkedFixture();
    const registration = await context.addRegistration(fixture.userId);
    await context.adminPool.query(
      `UPDATE staff_auth_sessions
       SET access_expires_at = created_at + interval '1 millisecond'
       WHERE id = $1`,
      [registration.sessionId],
    );
    await context.request(fixture);
    expect(await context.deliveryRegistrationIds(fixture.sessionId)).toEqual([
      registration.registrationId,
    ]);
  });

  it("keeps semantic retries deduplicated after a lost response", async () => {
    const fixture = await context.createGuestParkedFixture();
    await context.addRegistration(fixture.userId);
    await context.request(fixture);
    const afterCommit = await context.retrievalEffects(fixture.sessionId);
    await expect(context.request(fixture)).resolves.toMatchObject({
      state: "REQUESTED",
    });
    expect(await context.retrievalEffects(fixture.sessionId)).toEqual(
      afterCommit,
    );
    expect(afterCommit).toMatchObject({
      delivery_count: 1,
      intent_count: 1,
      request_count: 1,
      task_count: 1,
    });
  });

  it("does not backfill a registration created after intent commit", async () => {
    const fixture = await context.createGuestParkedFixture();
    await context.request(fixture);
    await context.addRegistration(fixture.userId);
    expect(await context.retrievalEffects(fixture.sessionId)).toMatchObject({
      delivery_count: 0,
      intent_count: 1,
    });
  });
});
