import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { Client, Pool } from "pg";
import { expect } from "vitest";

import {
  createMapsTrackingFixture,
  insertRawGpsSample,
  type MapsTrackingFixture,
} from "./maps-tracking-fixture.js";

const adminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const prismaCli = fileURLToPath(
  new URL("../node_modules/prisma/build/index.js", import.meta.url),
);

export class RawGpsRetentionTestContext {
  readonly databaseName = `valet_007f_${process.pid}_${Date.now()}`;
  readonly runtimePassword = `runtime-${randomUUID()}`;
  readonly runtimeRole = `valet_007f_runtime_${process.pid}_${Date.now()}`;
  adminPool!: Pool;
  runtimePool!: Pool;
  runtimeUrl!: string;

  private url(role?: string, password?: string): string {
    const url = new URL(adminUrl);
    url.pathname = `/${this.databaseName}`;
    if (role !== undefined) url.username = role;
    if (password !== undefined) url.password = password;
    return url.toString();
  }

  private run(args: string[], migrationUrl: string, runtimeUrl?: string) {
    return new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, args, {
        cwd: packageRoot,
        env: {
          ...process.env,
          DATABASE_URL: runtimeUrl,
          MIGRATION_DATABASE_URL: migrationUrl,
          NODE_ENV: "test",
        },
      });
      let output = "";
      child.stdout.on("data", (chunk) => (output += chunk.toString()));
      child.stderr.on("data", (chunk) => (output += chunk.toString()));
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0
          ? resolve(output)
          : reject(new Error(`Database script failed: ${output}`)),
      );
    });
  }

  async setup(): Promise<void> {
    const bootstrap = new Client({ connectionString: adminUrl });
    await bootstrap.connect();
    await bootstrap.query(`CREATE DATABASE "${this.databaseName}"`);
    await bootstrap.end();
    const migrationUrl = this.url();
    this.runtimeUrl = this.url(this.runtimeRole, this.runtimePassword);
    await this.run([prismaCli, "migrate", "deploy"], migrationUrl);
    await this.run(
      ["scripts/provision-runtime-role.mjs"],
      migrationUrl,
      this.runtimeUrl,
    );
    this.adminPool = new Pool({ connectionString: migrationUrl });
    this.runtimePool = new Pool({ connectionString: this.runtimeUrl });
  }

  async teardown(): Promise<void> {
    await this.runtimePool?.end();
    await this.adminPool?.end();
    const bootstrap = new Client({ connectionString: adminUrl });
    await bootstrap.connect();
    await bootstrap.query(`DROP DATABASE "${this.databaseName}" WITH (FORCE)`);
    await bootstrap.query(`DROP ROLE IF EXISTS "${this.runtimeRole}"`);
    await bootstrap.end();
  }

  fixture(): Promise<MapsTrackingFixture> {
    return createMapsTrackingFixture(this.adminPool);
  }

  sample(fixture: MapsTrackingFixture): Promise<string> {
    return insertRawGpsSample(this.adminPool, fixture);
  }

  runMaintenance(): Promise<string> {
    return this.run(["scripts/raw-gps-cleanup.mjs"], "", this.runtimeUrl);
  }

  runFailedMaintenance(runtimeUrl: string): Promise<string> {
    return this.run(["scripts/raw-gps-cleanup.mjs"], "", runtimeUrl);
  }

  async expectDenied(operation: Promise<unknown>): Promise<void> {
    await expect(operation).rejects.toMatchObject({ code: "42501" });
  }
}
