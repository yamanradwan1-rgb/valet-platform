import { randomUUID } from "node:crypto";

import type { Pool } from "pg";

type QueryClient = Pick<Pool, "query">;

export interface TaskDispatchScope {
  locationId: string;
  membershipId: string;
  organizationId: string;
  valetSessionId: string;
}

export interface TaskValues {
  assigneeId?: string | null;
  locationId?: string;
  organizationId?: string;
  status?: string;
  taskType?: string;
  valetSessionId?: string;
}

export async function createTaskDispatchScope(
  client: QueryClient,
  organizationId: string = randomUUID(),
): Promise<TaskDispatchScope> {
  const locationId = randomUUID();
  const membershipId = randomUUID();
  const userId = randomUUID();
  const vehicleId = randomUUID();
  const valetSessionId = randomUUID();
  await client.query(
    `INSERT INTO organizations (id, name, timezone, updated_at)
     VALUES ($1, $2, 'Asia/Amman', transaction_timestamp())
     ON CONFLICT (id) DO NOTHING`,
    [organizationId, `Task organization ${organizationId}`],
  );
  await client.query(
    `INSERT INTO locations
       (id, organization_id, name, code, address_text, timezone, currency, updated_at)
     VALUES ($1, $2, 'Task location', $3, 'Address', 'Asia/Amman', 'JOD', transaction_timestamp())`,
    [locationId, organizationId, randomUUID()],
  );
  await client.query(
    `INSERT INTO users (id, email, password_hash, updated_at)
     VALUES ($1, $2, 'test-hash', transaction_timestamp())`,
    [userId, `${userId}@task-dispatch.test`],
  );
  await client.query(
    `INSERT INTO organization_memberships
       (id, organization_id, user_id, role, updated_at)
     VALUES ($1, $2, $3, 'VALET_EMPLOYEE', transaction_timestamp())`,
    [membershipId, organizationId, userId],
  );
  await client.query(
    `INSERT INTO vehicles (id, organization_id, temporary_descriptor, updated_at)
     VALUES ($1, $2, 'Task vehicle', transaction_timestamp())`,
    [vehicleId, organizationId],
  );
  await client.query(
    `INSERT INTO valet_sessions
       (id, customer_access_token_hash, customer_access_expires_at,
        organization_id, location_id, vehicle_id, state,
        checked_in_by_membership_id, updated_at)
     VALUES ($1, $2, transaction_timestamp() + interval '1 hour', $3, $4,
             $5, 'AWAITING_PARKING', $6, transaction_timestamp())`,
    [
      valetSessionId,
      randomUUID(),
      organizationId,
      locationId,
      vehicleId,
      membershipId,
    ],
  );
  return { locationId, membershipId, organizationId, valetSessionId };
}

export async function createTask(
  client: QueryClient,
  scope: TaskDispatchScope,
  values: TaskValues = {},
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO tasks
       (id, organization_id, location_id, valet_session_id, task_type,
        status, current_assignee_membership_id, updated_at)
     VALUES ($1, $2, $3, $4, $5::task_type, $6::task_status, $7,
             transaction_timestamp())`,
    [
      id,
      values.organizationId ?? scope.organizationId,
      values.locationId ?? scope.locationId,
      values.valetSessionId ?? scope.valetSessionId,
      values.taskType ?? "PARKING",
      values.status ?? "QUEUED",
      values.assigneeId ?? null,
    ],
  );
  return id;
}

export async function createDispatchEvent(
  client: QueryClient,
  scope: TaskDispatchScope,
  taskId: string,
  type: string,
  previousId: string | null,
  newId: string | null,
  actorId: string | null = null,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO dispatch_events
       (id, organization_id, location_id, task_id, valet_session_id, event_type,
        actor_membership_id, previous_assignee_membership_id,
        new_assignee_membership_id)
     VALUES ($1, $2, $3, $4, $5, $6::dispatch_event_type, $7, $8, $9)`,
    [
      id,
      scope.organizationId,
      scope.locationId,
      taskId,
      scope.valetSessionId,
      type,
      actorId,
      previousId,
      newId,
    ],
  );
  return id;
}
