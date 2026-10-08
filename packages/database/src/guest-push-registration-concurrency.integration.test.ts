import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createDisposableDatabase,
  databaseAdminUrl,
  dropDisposableDatabase,
  seedT1Session,
  type SeededSession,
} from "./guest-browser-session-test-fixture.js";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const prismaCli = fileURLToPath(
  new URL("../node_modules/prisma/build/index.js", import.meta.url),
);
const apiRole = `valet_gpush_reg_${process.pid}_${Date.now()}`;
const apiPassword = `runtime-${randomUUID()}`;
const guestTokens = ["G".repeat(43), "H".repeat(43)] as const;
const enrollmentTokens = [
  `vge1.${"E".repeat(43)}`,
  `vge1.${"F".repeat(43)}`,
] as const;
const browserTokens = [
  `vgb1.${"B".repeat(43)}`,
  `vgb1.${"C".repeat(43)}`,
] as const;

let databaseName = "";
let migrationUrl = "";
let adminClient: Client;
let apiClients: Client[] = [];
let sessions: SeededSession[] = [];

function apiUrl(): string {
  const value = new URL(migrationUrl);
  value.username = apiRole;
  value.password = apiPassword;
  return value.toString();
}

function run(args: string[], env: Record<string, string>): void {
  execFileSync(process.execPath, args, {
    cwd: packageRoot,
    env: { ...process.env, ...env, NODE_ENV: "test" },
    stdio: "pipe",
  });
}

async function exchangeBrowser(
  client: Client,
  index: 0 | 1,
): Promise<void> {
  const enrolled = await client.query<{ result_code: string }>(
    `SELECT result_code FROM guest_browser_enroll($1,$2)`,
    [enrollmentTokens[index], browserTokens[index]],
  );
  expect(enrolled.rows[0]?.result_code).toBe("OK");
  const exchanged = await client.query<{ result_code: string }>(
    `SELECT result_code FROM guest_browser_exchange($1,$2,$3)`,
    [guestTokens[index], enrollmentTokens[index], browserTokens[index]],
  );
  expect(exchanged.rows[0]?.result_code).toBe("AUTHORIZED");
}

beforeAll(async () => {
  const database = await createDisposableDatabase("valet_guest_push_registration");
  databaseName = database.databaseName;
  migrationUrl = database.databaseUrl;
  run([prismaCli, "migrate", "deploy"], { MIGRATION_DATABASE_URL: migrationUrl });
  run(["scripts/provision-runtime-role.mjs"], {
    DATABASE_URL: apiUrl(),
    MIGRATION_DATABASE_URL: migrationUrl,
  });

  adminClient = new Client({ connectionString: migrationUrl });
  await adminClient.connect();
  sessions = [
    await seedT1Session(adminClient, "push-a", guestTokens[0], { state: "PARKED" }),
    await seedT1Session(adminClient, "push-b", guestTokens[1], { state: "PARKED" }),
  ];
  for (const session of sessions) {
    await adminClient.query(
      `UPDATE organizations
       SET guest_vehicle_ready_notification_enabled=true
       WHERE id=$1`,
      [session.organizationId],
    );
    // T1's generic fixture intentionally creates an INACTIVE Location.
    // Guest Push must reject it; explicitly activate only this disposable test Location.
    await adminClient.query(
      `UPDATE locations SET status='ACTIVE' WHERE id=$1`,
      [session.locationId],
    );
  }

  apiClients = [
    new Client({ connectionString: apiUrl() }),
    new Client({ connectionString: apiUrl() }),
  ];
  await Promise.all(apiClients.map((client) => client.connect()));
  await exchangeBrowser(apiClients[0]!, 0);
  await exchangeBrowser(apiClients[1]!, 1);
  await adminClient.query(
    `UPDATE valet_sessions
     SET customer_access_expires_at=clock_timestamp()-interval '1 hour'
     WHERE id=ANY($1::uuid[])`,
    [sessions.map(({ sessionId }) => sessionId)],
  );
});

afterAll(async () => {
  await Promise.all(apiClients.map((client) => client.end()));
  if (adminClient !== undefined) await adminClient.end();
  if (databaseName !== "") await dropDisposableDatabase(databaseName);
  const bootstrap = new Client({ connectionString: databaseAdminUrl });
  await bootstrap.connect();
  try {
    await bootstrap.query(`DROP ROLE IF EXISTS "${apiRole}"`);
  } finally {
    await bootstrap.end();
  }
});

describe("Guest Push Browser Session registration races", () => {
  it("registers after legacy bearer expiry because Browser Session is authoritative", async () => {
    const browserAuthority = await apiClients[0]!.query<{
      authority_scope: string;
      result_code: string;
    }>(
      `SELECT result_code, authority_scope FROM guest_browser_resolve($1,FALSE)`,
      [browserTokens[0]],
    );
    expect(browserAuthority.rows[0]).toMatchObject({
      result_code: "OK",
      authority_scope: "ACTIVE",
    });
    const effectivePolicy = await adminClient.query<{ enabled: boolean }>(
      `SELECT COALESCE(
         location.guest_vehicle_ready_notification_enabled_override,
         organization.guest_vehicle_ready_notification_enabled
       ) AS enabled
       FROM valet_sessions AS session
       INNER JOIN organizations AS organization
         ON organization.id = session.organization_id
       INNER JOIN locations AS location ON location.id = session.location_id
       WHERE session.id = $1`,
      [sessions[0]!.sessionId],
    );
    expect(effectivePolicy.rows[0]?.enabled).toBe(true);
    const result = await apiClients[0]!.query<{ registration_state: string }>(
      `SELECT registration_state
       FROM guest_push_register_v1($1,$2,$3,$4,$5)`,
      [
        browserTokens[0],
        "https://fcm.googleapis.com/fcm/send/legacy-expired",
        "P".repeat(87),
        "A".repeat(22),
        "en",
      ],
    );
    expect(result.rows[0]?.registration_state).toBe("ACTIVE");
  });

  it("serializes endpoint contention to one ACTIVE binding and clears loser secrets", async () => {
    const endpoint = "https://fcm.googleapis.com/fcm/send/shared-endpoint";
    const results = await Promise.all(
      apiClients.map((client, index) =>
        client.query<{ registration_state: string }>(
          `SELECT registration_state
           FROM guest_push_register_v1($1,$2,$3,$4,$5)`,
          [
            browserTokens[index as 0 | 1],
            endpoint,
            `${index === 0 ? "Q" : "R"}`.repeat(87),
            `${index === 0 ? "C" : "D"}`.repeat(22),
            index === 0 ? "en" : "ar",
          ],
        ),
      ),
    );
    expect(results.map((result) => result.rows[0]?.registration_state))
      .toEqual(["ACTIVE", "ACTIVE"]);

    const rows = await adminClient.query<{
      active: number;
      cleared_terminal: number;
    }>(
      `SELECT
         count(*) FILTER (WHERE state='ACTIVE')::int AS active,
         count(*) FILTER (
           WHERE state='SUPERSEDED'
             AND endpoint IS NULL AND p256dh IS NULL AND auth_secret IS NULL
         )::int AS cleared_terminal
       FROM guest_push_registrations
       WHERE valet_session_id=ANY($1::uuid[])`,
      [sessions.map(({ sessionId }) => sessionId)],
    );
    expect(rows.rows[0]?.active).toBe(1);
    expect(rows.rows[0]?.cleared_terminal).toBeGreaterThanOrEqual(1);
  });
});
