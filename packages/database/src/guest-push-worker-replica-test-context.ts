import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { Client } from "pg";

import {
  createDisposableDatabase,
  dropDisposableDatabase,
  seedT1Session,
} from "./guest-browser-session-test-fixture.js";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const prismaCli = fileURLToPath(
  new URL("../node_modules/prisma/build/index.js", import.meta.url),
);
const suffix = `${process.pid}_${Date.now()}`;

function opaque43(): string {
  return `${randomUUID()}${randomUUID()}`.replaceAll("-", "").slice(0, 43);
}

export interface GuestPushPreparedDelivery {
  readonly deliveryId: string;
  readonly intentId: string;
  readonly readyAt: Date;
  readonly sessionId: string;
}

export class GuestPushWorkerReplicaTestContext {
  readonly apiRole = `valet_gpush_replica_api_${suffix}`;
  readonly workerRole = `valet_gpush_replica_worker_${suffix}`;
  readonly apiPassword = `api-${randomUUID()}`;
  readonly workerPassword = `worker-${randomUUID()}`;

  databaseName = "";
  migrationUrl = "";
  workerUrl = "";
  adminClient!: Client;
  workerClient!: Client;

  private roleUrl(role: string, password: string): string {
    const value = new URL(this.migrationUrl);
    value.username = role;
    value.password = password;
    return value.toString();
  }

  private runScript(args: string[], env: Record<string, string>): void {
    execFileSync(process.execPath, args, {
      cwd: packageRoot,
      env: { ...process.env, ...env, NODE_ENV: "test" },
      stdio: "pipe",
    });
  }

  private async formattedStatement(format: string, values: string[]): Promise<string> {
    const placeholders = values.map((_, index) => `$${index + 2}::text`).join(", ");
    const result = await this.adminClient.query<{ statement: string }>(
      `SELECT format($1, ${placeholders}) AS statement`,
      [format, ...values],
    );
    return result.rows[0]!.statement;
  }

  async setup(): Promise<void> {
    const database = await createDisposableDatabase("valet_guest_push_replica");
    this.databaseName = database.databaseName;
    this.migrationUrl = database.databaseUrl;
    this.runScript([prismaCli, "migrate", "deploy"], {
      MIGRATION_DATABASE_URL: this.migrationUrl,
    });
    this.adminClient = new Client({ connectionString: this.migrationUrl });
    await this.adminClient.connect();
    await this.adminClient.query(
      await this.formattedStatement(
        "CREATE ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS",
        [this.workerRole, this.workerPassword],
      ),
    );
    this.runScript(["scripts/provision-runtime-role.mjs"], {
      DATABASE_URL: this.roleUrl(this.apiRole, this.apiPassword),
      MIGRATION_DATABASE_URL: this.migrationUrl,
    });
    this.workerUrl = this.roleUrl(this.workerRole, this.workerPassword);
    this.runScript(["scripts/provision-guest-push-worker-role.mjs"], {
      DATABASE_URL: this.roleUrl(this.apiRole, this.apiPassword),
      GUEST_PUSH_WORKER_DATABASE_URL: this.workerUrl,
      GUEST_PUSH_WORKER_ROLE: this.workerRole,
      MIGRATION_DATABASE_URL: this.migrationUrl,
    });
    this.workerClient = new Client({ connectionString: this.workerUrl });
    await this.workerClient.connect();
  }

  async teardown(): Promise<void> {
    if (this.workerClient !== undefined) await this.workerClient.end();
    if (this.adminClient !== undefined) {
      for (const role of [this.workerRole, this.apiRole]) {
        await this.adminClient.query(
          await this.formattedStatement("DROP OWNED BY %I", [role]),
        );
        await this.adminClient.query(
          await this.formattedStatement("DROP ROLE IF EXISTS %I", [role]),
        );
      }
      await this.adminClient.end();
    }
    if (this.databaseName !== "") await dropDisposableDatabase(this.databaseName);
  }

  async prepareDelivery(label: string): Promise<GuestPushPreparedDelivery> {
    const guestToken = opaque43();
    const enrollmentToken = `vge1.${opaque43()}`;
    const browserToken = `vgb1.${opaque43()}`;
    const session = await seedT1Session(this.adminClient, label, guestToken, {
      state: "PARKED",
    });
    await this.adminClient.query(
      `UPDATE organizations
       SET guest_vehicle_ready_notification_enabled = true WHERE id = $1`,
      [session.organizationId],
    );
    await this.adminClient.query(
      `UPDATE locations SET status = 'ACTIVE' WHERE id = $1`,
      [session.locationId],
    );
    await this.adminClient.query("SELECT guest_browser_enroll($1,$2)", [
      enrollmentToken,
      browserToken,
    ]);
    await this.adminClient.query("SELECT guest_browser_exchange($1,$2,$3)", [
      guestToken,
      enrollmentToken,
      browserToken,
    ]);
    await this.adminClient.query(
      "SELECT guest_push_register_v1($1,$2,$3,$4,$5)",
      [
        browserToken,
        `https://fcm.googleapis.com/fcm/send/${label}-${opaque43()}`,
        "P".repeat(87),
        "A".repeat(22),
        "en",
      ],
    );
    const readyAt = await this.forceReady(session.sessionId);
    const intent = await this.adminClient.query<{
      delivery_count: number;
      intent_id: string;
    }>(
      "SELECT * FROM guest_push_ready_intent_v1($1,$2,$3,$4)",
      [session.organizationId, session.locationId, session.sessionId, readyAt],
    );
    if (intent.rows[0]?.delivery_count !== 1) {
      throw new Error("Guest Push fixture did not create exactly one delivery.");
    }
    const delivery = await this.adminClient.query<{ id: string }>(
      "SELECT id FROM guest_push_deliveries WHERE intent_id = $1",
      [intent.rows[0].intent_id],
    );
    return {
      deliveryId: delivery.rows[0]!.id,
      intentId: intent.rows[0].intent_id,
      readyAt,
      sessionId: session.sessionId,
    };
  }

  async expireLease(deliveryId: string): Promise<void> {
    await this.bypassGuards(
      `UPDATE guest_push_deliveries
       SET lease_expires_at = clock_timestamp() - interval '1 second'
       WHERE id = $1`,
      [deliveryId],
    );
  }

  async setIntentLifetime(intentId: string, seconds: number): Promise<Date> {
    await this.bypassGuards(
      `UPDATE guest_push_intents
       SET expires_at = clock_timestamp() + make_interval(secs => $2)
       WHERE id = $1`,
      [intentId, seconds],
    );
    const result = await this.adminClient.query<{ expires_at: Date }>(
      "SELECT expires_at FROM guest_push_intents WHERE id = $1",
      [intentId],
    );
    return result.rows[0]!.expires_at;
  }

  private async forceReady(sessionId: string): Promise<Date> {
    await this.adminClient.query("BEGIN");
    try {
      await this.adminClient.query("SET LOCAL session_replication_role = replica");
      const result = await this.adminClient.query<{ ready_at: Date }>(
        `UPDATE valet_sessions
         SET state = 'READY', ready_at = clock_timestamp(), updated_at = clock_timestamp()
         WHERE id = $1 RETURNING ready_at`,
        [sessionId],
      );
      await this.adminClient.query("COMMIT");
      return result.rows[0]!.ready_at;
    } catch (error) {
      await this.adminClient.query("ROLLBACK");
      throw error;
    }
  }

  private async bypassGuards(sql: string, values: unknown[]): Promise<void> {
    await this.adminClient.query("BEGIN");
    try {
      await this.adminClient.query("SET LOCAL session_replication_role = replica");
      await this.adminClient.query(sql, values);
      await this.adminClient.query("COMMIT");
    } catch (error) {
      await this.adminClient.query("ROLLBACK");
      throw error;
    }
  }
}
