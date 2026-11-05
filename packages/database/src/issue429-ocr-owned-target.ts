import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { Client } from "pg";

import { assertClusterLeaseOwner } from "../../../scripts/test-harness/ownership-state.mjs";

const expectedPort = "45432";
const expectedDatabase = "vaylet_test";
const expectedOwner = "vaylet_test_admin";
const ownDb = /^vlt_t_db_429_[0-9a-f]{32}$/;
const ownRole = /^vlt_t_role_429_[0-9a-f]{32}$/;

export class Issue429OcrOwnedTarget {
  readonly bootstrapUrl: string;
  private readonly runId: string;
  private verified = false;
  private readonly databases = new Set<string>();
  private readonly roles = new Set<string>();

  constructor(env: NodeJS.ProcessEnv = process.env) {
    const raw = env.TEST_DATABASE_URL;
    if (!raw || env.NODE_ENV !== "test" ||
        env.VAYLET_TEST_PROJECT !== "database-postgres-provision" ||
        !env.VAYLET_TEST_RUN_ID ||
        env.ISSUE429_W2_PG17_LEASE !== "ATTESTED_EXCLUSIVE") {
      throw new Error("Issue429 W2 requires attested exclusive PostgreSQL17 lease.");
    }
    const parsed = new URL(raw);
    if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
      throw new Error("Issue429 test target requires PostgreSQL.");
    }
    if (parsed.hostname !== "127.0.0.1" || parsed.port !== expectedPort ||
        parsed.pathname !== `/${expectedDatabase}` ||
        parsed.username !== expectedOwner || !parsed.password ||
        parsed.search || parsed.hash) {
      throw new Error("Issue429 W2 forbids unverified or production PostgreSQL targets.");
    }
    for (const key of [
      "PGHOST", "PGPORT", "PGDATABASE", "PGUSER",
      "PGSERVICE", "PGOPTIONS", "PGSERVICEFILE",
    ]) {
      if (env[key]) throw new Error("Issue429 W2 refuses PostgreSQL client overrides.");
    }
    this.bootstrapUrl = raw;
    this.runId = env.VAYLET_TEST_RUN_ID;
    assertClusterLeaseOwner({
      databaseUrl: raw,
      runId: this.runId,
    });
  }

  private inspectDocker(): void {
    const targets = JSON.parse(execFileSync("docker", [
      "inspect", "vaylet-test-postgres",
    ], { encoding: "utf8", timeout: 5000, windowsHide: true, stdio: "pipe" }));
    const target = targets.length === 1 ? targets[0] : undefined;
    const ports = target?.NetworkSettings?.Ports?.["5432/tcp"];
    if (target?.Name !== "/vaylet-test-postgres" ||
        !/^postgres:17(?:[.-]|$)/.test(target.Config?.Image ?? "") ||
        target.State?.Status !== "running" ||
        !target.Config?.Env?.includes("POSTGRES_USER=vaylet_test_admin") ||
        !target.Config?.Env?.includes("POSTGRES_DB=vaylet_test") ||
        !Array.isArray(ports) || ports.length !== 1 ||
        ports[0].HostIp !== "127.0.0.1" ||
        ports[0].HostPort !== expectedPort ||
        target.Mounts?.some((mount: { Type: string }) => mount.Type === "bind")) {
      throw new Error("Issue429 W2 Docker PostgreSQL17 identity mismatch.");
    }
  }

  private async withAdmin<T>(action: (client: Client) => Promise<T>): Promise<T> {
    assertClusterLeaseOwner({
      databaseUrl: this.bootstrapUrl, runId: this.runId,
    });
    this.inspectDocker();
    const client = new Client({
      connectionString: this.bootstrapUrl,
      connectionTimeoutMillis: 4000,
    });
    try {
      await client.connect();
      const { rows } = await client.query(`
        SELECT current_database() AS database, current_user AS actor,
          session_user AS session_role, pg_is_in_recovery() AS recovery,
          pg_get_userbyid(d.datdba) AS owner,
          current_setting('server_version_num')::integer AS version,
          r.rolcreatedb AS createdb,r.rolcreaterole AS createrole
        FROM pg_database d JOIN pg_roles r ON r.rolname=current_user
        WHERE d.datname=current_database()`);
      const row = rows[0];
      if (row?.database !== expectedDatabase || row.actor !== expectedOwner ||
          row.session_role !== expectedOwner || row.owner !== expectedOwner ||
          row.recovery !== false || row.createdb !== true ||
          row.createrole !== true || row.version < 170000 ||
          row.version >= 180000) {
        throw new Error("Issue429 W2 live PostgreSQL17 owner identity mismatch.");
      }
      this.verified = true;
      return await action(client);
    } finally {
      await client.end().catch(() => {});
    }
  }

  async createDatabase(): Promise<string> {
    const name = `vlt_t_db_429_${randomUUID().replaceAll("-", "")}`;
    await this.withAdmin(async (admin) => {
      await admin.query(`CREATE DATABASE "${name}"`);
      this.databases.add(name);
    });
    const url = new URL(this.bootstrapUrl);
    url.pathname = `/${name}`;
    return url.toString();
  }

  async createRole(password: string): Promise<string> {
    const role = `vlt_t_role_429_${randomUUID().replaceAll("-", "")}`;
    await this.withAdmin(async (admin) => {
      const { rows } = await admin.query<{ sql: string }>(
        "SELECT format('CREATE ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS', $1::text,$2::text) AS sql",
        [role, password],
      );
      if (!rows[0]?.sql) throw new Error("Issue429 role creation failed.");
      await admin.query(rows[0].sql);
      this.roles.add(role);
    });
    return role;
  }

  async close(): Promise<void> {
    if (!this.verified) return;
    await this.withAdmin(async (admin) => {
      for (const db of this.databases) {
        if (!ownDb.test(db)) throw new Error("Issue429 refuses nonowned database removal.");
        const result = await admin.query<{ owner: string }>(
          "SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1",
          [db],
        );
        if (result.rows[0]?.owner !== expectedOwner) {
          throw new Error("Issue429 test database no longer owned by bootstrap role.");
        }
        await admin.query(`DROP DATABASE "${db}" WITH (FORCE)`);
        this.databases.delete(db);
      }
      for (const role of this.roles) {
        if (!ownRole.test(role)) throw new Error("Issue429 refuses nonowned role removal.");
        const result = await admin.query<{ can_login: boolean }>(
          "SELECT rolcanlogin AS can_login FROM pg_roles WHERE rolname=$1", [role],
        );
        if (result.rows[0]?.can_login !== true) {
          throw new Error("Issue429 test role was replaced; refusing cleanup.");
        }
        await admin.query(`DROP ROLE "${role}"`);
        this.roles.delete(role);
      }
    });
  }

  async dropOperatorCapability(expectedOid: string): Promise<void> {
    await this.withAdmin(async (admin) => {
      const { rows } = await admin.query<{
        oid: string; can_login: boolean; can_inherit: boolean; members: number;
      }>(`
        SELECT role.oid::text AS oid,
          role.rolcanlogin AS can_login,role.rolinherit AS can_inherit,
          (SELECT count(*)::integer FROM pg_auth_members m
           WHERE m.roleid=role.oid OR m.member=role.oid) AS members
        FROM pg_roles role WHERE role.rolname='vaylet_ocr_operator'`);
      if (rows.length !== 1 || rows[0]!.oid !== expectedOid ||
          rows[0]!.can_login ||
          rows[0]!.can_inherit || rows[0]!.members !== 0) {
        throw new Error("Issue429 refuses to drop a changed operator capability.");
      }
      await admin.query("DROP ROLE vaylet_ocr_operator");
    });
  }
}
