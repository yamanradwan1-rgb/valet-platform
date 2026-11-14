import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { Client } from "pg";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const prismaCli = fileURLToPath(
  new URL("../node_modules/prisma/build/index.js", import.meta.url),
);

export class Issue416AuditTestContext {
  readonly runtimeRole = `valet_issue416_runtime_${randomUUID().replaceAll("-", "")}`;
  readonly databaseName = `valet_issue416_audit_${randomUUID().replaceAll("-", "")}`;
  readonly userId = randomUUID();
  readonly bootstrap: Client;
  readonly admin: Client;
  readonly runtime: Client;
  private databaseCreated = false;
  private readonly adminUrl: string;
  private readonly runtimeUrl: string;

  constructor() {
    const value = process.env.TEST_DATABASE_URL;
    if (
      value === undefined ||
      process.env.VAYLET_TEST_PROJECT !== "database-postgres-provision" ||
      !process.env.VAYLET_TEST_RUN_ID
    ) {
      throw new Error(
        "Issue416 requires an explicit owned PostgreSQL test run.",
      );
    }
    let target: URL;
    try {
      target = new URL(value);
    } catch {
      throw new Error("Issue416 test database URL is invalid.");
    }
    if (
      !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
      !["postgres:", "postgresql:"].includes(target.protocol) ||
      target.pathname.length < 2 ||
      target.search !== "" ||
      target.hash !== ""
    ) {
      throw new Error(
        "Issue416 requires the owned loopback PostgreSQL target.",
      );
    }
    this.bootstrap = new Client({ connectionString: value });
    target.pathname = `/${this.databaseName}`;
    this.adminUrl = target.toString();
    this.admin = new Client({ connectionString: this.adminUrl });
    target.username = this.runtimeRole;
    target.password = randomUUID();
    this.runtimeUrl = target.toString();
    this.runtime = new Client({ connectionString: this.runtimeUrl });
  }

  async setup(): Promise<void> {
    await this.bootstrap.connect();
    await this.bootstrap.query(`CREATE DATABASE "${this.databaseName}"`);
    this.databaseCreated = true;
    this.run([prismaCli, "migrate", "deploy"]);
    this.run(["scripts/provision-runtime-role.mjs"]);
    await this.admin.connect();
    await this.runtime.connect();
    await this.admin.query(
      `INSERT INTO users(id,email,password_hash,updated_at)
       VALUES ($1,$2,'synthetic-unusable-password',clock_timestamp())`,
      [this.userId, `${this.userId}@issue416.invalid`],
    );
  }

  provisionRuntime(): void {
    this.run(["scripts/provision-runtime-role.mjs"]);
  }

  async cleanup(): Promise<void> {
    await this.runtime.end();
    await this.admin.end();
    try {
      if (this.databaseCreated) {
        await this.bootstrap.query(
          `DROP DATABASE "${this.databaseName}" WITH (FORCE)`,
        );
      }
      await this.bootstrap.query(`DROP ROLE IF EXISTS "${this.runtimeRole}"`);
    } finally {
      await this.bootstrap.end();
    }
  }

  private run(args: string[]): void {
    try {
      execFileSync(process.execPath, args, {
        cwd: packageRoot,
        env: {
          ...process.env,
          DATABASE_URL: this.runtimeUrl,
          MIGRATION_DATABASE_URL: this.adminUrl,
          NODE_ENV: "test",
        },
        windowsHide: true,
        stdio: "pipe",
      });
    } catch {
      throw new Error("Issue416 test database setup command failed.");
    }
  }
}
