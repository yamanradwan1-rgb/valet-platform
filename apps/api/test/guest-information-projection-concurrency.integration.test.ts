import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  GuestInformationScopeUnavailableError,
  readGuestInformationProjection,
} from "../src/modules/management/guest-information-public-projection";
import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();
const publishedText = "Approved guest privacy policy";
const draftText = "Private unpublished guest privacy draft";

interface Scenario {
  readonly organizationId: string;
  readonly locationId: string;
  readonly actorId: string;
  readonly locationUpdatedAt: Date;
}

async function createScenario(): Promise<Scenario> {
  const actor = await fixture.createUser();
  const organizationId = await fixture.createOrganization();
  const actorId = await fixture.addMembership(
    organizationId,
    actor.id,
    "ORG_ADMIN",
  );
  const locationId = (await fixture.addLocation(organizationId)).locationId;
  const args = [actorId, organizationId, locationId];
  const saved = await fixture.query<{ revision: number }>(
    "SELECT guest_information_save_privacy($1::uuid,$2::uuid,$3::uuid,$4::text,'',$5::text,'',0) AS revision",
    [...args, publishedText, "سياسة منشورة"],
  );
  expect(saved.rows[0]?.revision).toBe(1);
  const published = await fixture.query<{ revision: number }>(
    "SELECT guest_information_publish_privacy($1::uuid,$2::uuid,$3::uuid,1) AS revision",
    args,
  );
  expect(published.rows[0]?.revision).toBe(2);
  const drafted = await fixture.query<{ revision: number }>(
    "SELECT guest_information_save_privacy($1::uuid,$2::uuid,$3::uuid,$4::text,'',$5::text,'',2) AS revision",
    [...args, draftText, "مسودة غير منشورة"],
  );
  expect(drafted.rows[0]?.revision).toBe(3);
  const location = await fixture.query<{ updated_at: Date }>(
    "UPDATE locations SET accepting_intake=FALSE WHERE id=$1 RETURNING updated_at",
    [locationId],
  );
  return {
    actorId,
    locationId,
    organizationId,
    locationUpdatedAt: location.rows[0]!.updated_at,
  };
}

async function transactionalClient(): Promise<PoolClient> {
  const connection = await fixture.databasePool().connect();
  await connection.query("BEGIN");
  await connection.query("SET LOCAL statement_timeout='8s'");
  await connection.query("SET LOCAL lock_timeout='6s'");
  await connection.query("SET LOCAL idle_in_transaction_session_timeout='12s'");
  return connection;
}

async function dispose(connections: readonly PoolClient[]) {
  for (const connection of connections) {
    await connection.query("ROLLBACK").catch(() => undefined);
    connection.release();
  }
}

function read(connection: PoolClient, scenario: Scenario) {
  return readGuestInformationProjection(connection, {
    organizationId: scenario.organizationId,
    locationId: scenario.locationId,
    locale: "en",
  });
}

async function unpublish(connection: PoolClient, scenario: Scenario) {
  const result = await connection.query<{ revision: number }>(
    "SELECT guest_information_unpublish_privacy($1::uuid,$2::uuid,$3::uuid,3) AS revision",
    [scenario.actorId, scenario.organizationId, scenario.locationId],
  );
  expect(result.rows[0]?.revision).toBe(4);
}

async function deactivate(connection: PoolClient, scenario: Scenario) {
  const result = await connection.query<{ result_code: string }>(
    "SELECT result_code FROM management_location_deactivate($1::uuid,$2::uuid,$3::uuid,$4::timestamptz)",
    [
      scenario.actorId,
      scenario.organizationId,
      scenario.locationId,
      scenario.locationUpdatedAt,
    ],
  );
  expect(result.rows[0]?.result_code).toBe("OK");
}

async function deactivateOrganization(
  connection: PoolClient,
  scenario: Scenario,
) {
  // The schema has no Management organization-deactivation command; exercise
  // its actual status write and row lock without inventing an HTTP endpoint.
  const result = await connection.query(
    "UPDATE organizations SET status='INACTIVE' WHERE id=$1 AND status='ACTIVE'",
    [scenario.organizationId],
  );
  expect(result.rowCount).toBe(1);
}

type RevocationName =
  "privacy unpublish" | "Location deactivation" | "Organization deactivation";
type Revocation = (connection: PoolClient, scenario: Scenario) => Promise<void>;
const revocations: readonly { name: RevocationName; revoke: Revocation }[] = [
  { name: "privacy unpublish", revoke: unpublish },
  { name: "Location deactivation", revoke: deactivate },
  { name: "Organization deactivation", revoke: deactivateOrganization },
];

async function assertBackendBlocked(connection: PoolClient) {
  const pid = Number(
    (await connection.query<{ pid: number }>("SELECT pg_backend_pid() AS pid"))
      .rows[0]!.pid,
  );
  return async () => {
    const activity = await fixture.query<{ wait_event_type: string | null }>(
      "SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1",
      [pid],
    );
    return activity.rows[0]?.wait_event_type;
  };
}

async function verifyRevoked(
  reader: PoolClient,
  scenario: Scenario,
  name: RevocationName,
) {
  if (name !== "privacy unpublish") {
    await expect(read(reader, scenario)).rejects.toBeInstanceOf(
      GuestInformationScopeUnavailableError,
    );
    return;
  }
  const result = await read(reader, scenario);
  expect(result.privacy).toEqual({
    status: "UNAVAILABLE",
    text: null,
    url: null,
    version: null,
    publishedAt: null,
  });
}

async function readerFirst(name: RevocationName, revoke: Revocation) {
  const scenario = await createScenario();
  const reader = await transactionalClient();
  const writer = await transactionalClient();
  try {
    const result = await read(reader, scenario);
    expect(result.privacy).toMatchObject({
      status: "PUBLISHED",
      text: publishedText,
      version: 1,
    });
    expect(result.privacy.text).not.toBe(draftText);
    const waitEvent = await assertBackendBlocked(writer);
    const pending = revoke(writer, scenario);
    void pending.catch(() => undefined);
    await expect.poll(waitEvent, { timeout: 3_000, interval: 30 }).toBe("Lock");
    await reader.query("COMMIT");
    await pending;
    await writer.query("COMMIT");
    const next = await transactionalClient();
    try {
      await verifyRevoked(next, scenario, name);
    } finally {
      await dispose([next]);
    }
  } finally {
    await dispose([reader, writer]);
  }
}

async function revokerFirst(name: RevocationName, revoke: Revocation) {
  const scenario = await createScenario();
  const reader = await transactionalClient();
  const writer = await transactionalClient();
  try {
    await revoke(writer, scenario);
    const waitEvent = await assertBackendBlocked(reader);
    const pending = read(reader, scenario);
    void pending.catch(() => undefined);
    await expect.poll(waitEvent, { timeout: 3_000, interval: 30 }).toBe("Lock");
    await writer.query("COMMIT");
    if (name !== "privacy unpublish") {
      await expect(pending).rejects.toBeInstanceOf(
        GuestInformationScopeUnavailableError,
      );
    } else {
      const result = await pending;
      expect(result.privacy).toMatchObject({
        status: "UNAVAILABLE",
        text: null,
      });
      expect(result.privacy.text).not.toBe(draftText);
    }
  } finally {
    await dispose([reader, writer]);
  }
}

describe("Guest #316 PostgreSQL unpublish / deactivation interleavings", () => {
  beforeAll(() => fixture.start(), 120_000);
  afterAll(() => fixture.stop(), 60_000);

  it.each(revocations)(
    "reader-first: $name waits for guest read commit",
    async ({ name, revoke }) => {
      await readerFirst(name, revoke);
    },
    25_000,
  );

  it.each(revocations)(
    "revoker-first: $name prevents stale Guest response",
    async ({ name, revoke }) => {
      await revokerFirst(name, revoke);
    },
    25_000,
  );
});
