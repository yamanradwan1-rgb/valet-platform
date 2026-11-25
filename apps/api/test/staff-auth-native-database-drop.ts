import { setTimeout as pause } from "node:timers/promises";

import type { Pool } from "pg";
import { postgresEndpointIdentity } from "../../../scripts/test-harness/postgres-endpoint.mjs";

const exactFixtureName = /^valet_mob007_auth_[0-9]+_[a-f0-9]{8}$/;
const poolCloserSymbol = Symbol.for("vaylet.test.postgres.close-owned-pools");

export function assertStaffAuthFixtureEndpoints(
  databaseName: string,
  runtimeDatabaseUrl: string,
  adminDatabaseUrl: string,
  migrationDatabaseUrl: string,
  writers: Record<string, string>,
): void {
  if (!exactFixtureName.test(databaseName)) {
    throw new Error("Staff Auth fixture requires an exact owned database.");
  }
  const expected = postgresEndpointIdentity(runtimeDatabaseUrl);
  const adminTarget = new URL(adminDatabaseUrl);
  adminTarget.pathname = `/${databaseName}`;
  const endpoints = [
    adminTarget.toString(),
    migrationDatabaseUrl,
    ...Object.entries(writers)
      .filter(([name]) => name.endsWith("_DATABASE_URL"))
      .map(([, url]) => url),
  ];
  if (
    expected.database !== databaseName ||
    endpoints.some((url) => postgresEndpointIdentity(url).key !== expected.key)
  ) {
    throw new Error("Staff Auth fixture database endpoints do not match.");
  }
}

export async function closeStaffAuthFixturePools(
  databaseName: string,
  fixtureDatabaseUrl: string,
) {
  if (!exactFixtureName.test(databaseName)) {
    throw new Error(
      "Staff Auth fixture cleanup requires an exact owned database.",
    );
  }
  if (postgresEndpointIdentity(fixtureDatabaseUrl).database !== databaseName) {
    throw new Error("Staff Auth fixture cleanup target does not match.");
  }
  const closer = (globalThis as unknown as Record<symbol, unknown>)[
    poolCloserSymbol
  ];
  if (typeof closer !== "function") {
    throw new Error(
      "Staff Auth fixture requires the PostgreSQL test pool registry.",
    );
  }
  await (closer as (url: string) => Promise<void>)(fixtureDatabaseUrl);
}

export async function dropStaffAuthFixtureDatabase(
  bootstrap: Pick<Pool, "query">,
  databaseName: string,
): Promise<void> {
  if (!exactFixtureName.test(databaseName)) {
    throw new Error(
      "Staff Auth fixture cleanup requires an exact owned database.",
    );
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await bootstrap.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
      return;
    } catch (error) {
      if ((error as { code?: string }).code !== "55006" || attempt === 2) {
        throw error;
      }
      await pause(100 * (attempt + 1));
    }
  }
}
