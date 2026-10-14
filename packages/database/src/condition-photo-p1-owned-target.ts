import { randomUUID } from "node:crypto";

import { Client } from "pg";

import {
  requireIssue215TestUrl,
  verifyIssue215Bootstrap,
} from "./condition-photo-p1-test-target.js";

const ownedPrefix = "vlt_t_db_215_";
const rolePrefix = "vlt_t_role_215_";

export class ConditionPhotoP1OwnedTarget {
  readonly bootstrapUrl: string;
  private verified = false;
  private readonly ownerRole: string;
  private readonly databases = new Set<string>();
  private readonly roles = new Set<string>();

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.bootstrapUrl = requireIssue215TestUrl(env);
    this.ownerRole = new URL(this.bootstrapUrl).username;
  }

  private async withVerifiedAdmin<T>(action: (client: Client) => Promise<T>): Promise<T> {
    const client = new Client({ connectionString: this.bootstrapUrl });
    try {
      await client.connect();
      await verifyIssue215Bootstrap(client);
      this.verified = true;
      return await action(client);
    } finally {
      try { await client.end(); }
      catch { /* Failed preflight must never become permission to mutate. */ }
    }
  }

  async verify(): Promise<void> {
    await this.withVerifiedAdmin(async () => {});
  }

  async createDatabase(): Promise<{ name: string; url: string }> {
    const name = `${ownedPrefix}${randomUUID().replaceAll("-", "")}`;
    await this.withVerifiedAdmin(async (admin) => {
      await admin.query(`CREATE DATABASE "${name}"`);
      this.databases.add(name);
    });
    const url = new URL(this.bootstrapUrl);
    url.pathname = `/${name}`;
    return { name, url: url.toString() };
  }

  async createRole(password: string): Promise<string> {
    const name = `${rolePrefix}${randomUUID().replaceAll("-", "")}`;
    await this.withVerifiedAdmin(async (admin) => {
      const existing = await admin.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [name]);
      if (existing.rowCount !== 0) throw new Error("Issue 215 generated role already exists; refusing reuse.");
      const statement = await admin.query<{ sql: string }>(
        "SELECT format('CREATE ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS', $1::text, $2::text) AS sql",
        [name, password],
      );
      if (!statement.rows[0]?.sql) throw new Error("Unable to format task-only role creation.");
      await admin.query(statement.rows[0].sql);
      this.roles.add(name);
    });
    return name;
  }

  async close(): Promise<void> {
    if (!this.verified || (this.databases.size === 0 && this.roles.size === 0)) return;
    await this.withVerifiedAdmin(async (admin) => {
      const failures: unknown[] = [];
      for (const name of this.databases) {
        try {
          const result = await admin.query<{ owner: string }>(
            "SELECT owner.rolname AS owner FROM pg_database database JOIN pg_roles owner ON owner.oid=database.datdba WHERE database.datname=$1",
            [name],
          );
          if (result.rows[0]?.owner !== this.ownerRole) throw new Error("Task database ownership changed; refusing DROP.");
          await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
          this.databases.delete(name);
        } catch (error) { failures.push(error); }
      }
      if (failures.length === 0) {
        for (const role of this.roles) {
          try {
            const result = await admin.query<{ can_login: boolean; can_create_db: boolean }>(
              "SELECT rolcanlogin AS can_login, rolcreatedb AS can_create_db FROM pg_roles WHERE rolname=$1",
              [role],
            );
            if (result.rows[0]?.can_login !== true || result.rows[0]?.can_create_db !== false)
              throw new Error("Task role attributes changed; refusing DROP.");
            await admin.query(`DROP ROLE "${role}"`);
            this.roles.delete(role);
          } catch (error) { failures.push(error); }
        }
      }
      if (failures.length) throw new AggregateError(failures, "Issue 215 task-owned cleanup failed.");
    });
  }
}
