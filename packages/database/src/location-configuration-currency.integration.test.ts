import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { Client, Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";

const adminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const suffix = `${process.pid}_${Date.now()}`;
const databaseName = `valet_009b_fee_${suffix}`;
const runtimeRole = `valet_009b_fee_runtime_${suffix}`;
const runtimePassword = `runtime-${randomUUID()}`;
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const prismaCli = fileURLToPath(
  new URL("../node_modules/prisma/build/index.js", import.meta.url),
);
const currencyAuthoritySource = fileURLToPath(
  new URL(
    "../../../apps/api/src/common/financial/currency-minor-units.ts",
    import.meta.url,
  ),
);
let adminPool: Pool;
const organizationId = randomUUID();
const membershipId = randomUUID();
const currencyLocations: Record<"JOD" | "USD" | "XAU", string> = {
  JOD: randomUUID(),
  USD: randomUUID(),
  XAU: randomUUID(),
};

function scopedUrl(role?: string, password?: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  if (role !== undefined) url.username = role;
  if (password !== undefined) url.password = password;
  return url.toString();
}

async function runDatabaseScript(
  command: string,
  args: string[],
  migrationUrl: string,
  runtimeUrl?: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: packageRoot,
      env: {
        ...process.env,
        DATABASE_URL: runtimeUrl,
        MIGRATION_DATABASE_URL: migrationUrl,
        NODE_ENV: "test",
      },
    });
    let output = "";
    child.stderr.on("data", (chunk) => (output += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Database script failed: ${output}`)),
    );
  });
}

async function seedLocation(currency: string, locationId: string) {
  await adminPool.query(
    `INSERT INTO locations
       (id, organization_id, name, code, address_text, timezone, currency,
        status, updated_at)
     VALUES ($1, $2, $3, $4, 'Address', 'Asia/Amman', $5, 'ACTIVE',
             transaction_timestamp())`,
    [locationId, organizationId, `Fee location ${currency}`, locationId, currency],
  );
  await adminPool.query(
    `INSERT INTO membership_location_access
       (organization_id, membership_id, location_id) VALUES ($1, $2, $3)`,
    [organizationId, membershipId, locationId],
  );
}

async function feeState(
  locationId: string,
): Promise<{ audit_count: number; token: Date; value: string | null }> {
  const result = await adminPool.query<{
    audit_count: string;
    token: Date;
    value: string | null;
  }>(
    `SELECT updated_at AS token,
            valet_service_fee_override::text AS value,
            (SELECT count(*)::text FROM audit_events
             WHERE entity_type = 'Location' AND location_id = $1
               AND event_type LIKE 'LOCATION_CONFIGURATION_%') AS audit_count
     FROM locations WHERE id = $1`,
    [locationId],
  );
  const row = result.rows[0]!;
  return {
    audit_count: Number(row.audit_count),
    token: row.token,
    value: row.value,
  };
}

async function runtimeSetFee(
  runtime: Client,
  locationId: string,
  value: string,
  expectedUpdatedAt: Date,
): Promise<Date> {
  const result = await runtime.query<{ token: Date }>(
    `SELECT location_configuration_set_override($1, $2, 'valetServiceFee', $3, $4)
       AS token`,
    [membershipId, locationId, value, expectedUpdatedAt],
  );
  return result.rows[0]!.token;
}

beforeAll(async () => {
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`CREATE DATABASE "${databaseName}"`);
  await bootstrap.end();

  const migrationUrl = scopedUrl();
  await runDatabaseScript(
    process.execPath,
    [prismaCli, "migrate", "deploy"],
    migrationUrl,
  );
  await runDatabaseScript(
    process.execPath,
    ["scripts/provision-runtime-role.mjs"],
    migrationUrl,
    scopedUrl(runtimeRole, runtimePassword),
  );
  adminPool = new Pool({ connectionString: migrationUrl });

  const userId = randomUUID();
  await adminPool.query(
    `INSERT INTO organizations (id, name, timezone, updated_at)
     VALUES ($1, 'DEC-053 boundary tenant', 'Asia/Amman',
             transaction_timestamp())`,
    [organizationId],
  );
  await adminPool.query(
    `INSERT INTO users (id, email, password_hash, status, updated_at)
     VALUES ($1, $2, 'not-a-real-password-hash', 'ACTIVE',
             transaction_timestamp())`,
    [userId, `${userId}@fee-boundary.test`],
  );
  await adminPool.query(
    `INSERT INTO organization_memberships
       (id, organization_id, user_id, role, status, updated_at)
     VALUES ($1, $2, $3, 'LOCATION_MANAGER', 'ACTIVE',
             transaction_timestamp())`,
    [membershipId, organizationId, userId],
  );
  for (const [currency, locationId] of Object.entries(currencyLocations)) {
    await seedLocation(currency, locationId);
  }
}, 120_000);

afterAll(async () => {
  await adminPool?.end();
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  await bootstrap.query(`DROP ROLE IF EXISTS "${runtimeRole}"`);
  await bootstrap.end();
}, 60_000);

it("mirrors the checked-in TS minor-unit authority exactly", async () => {
  const source = await readFile(currencyAuthoritySource, "utf8");
  const registryStart = source.indexOf("const currencyMinorUnitRegistry:");
  const registryBody = source.slice(
    registryStart,
    source.indexOf("});", registryStart),
  );
  const entryPattern = /([A-Z]{3}):\s*(\d+|null)/g;
  const entries = [...registryBody.matchAll(entryPattern)].map(
    (match) => [match[1], match[2] === "null" ? null : Number(match[2])] as const,
  );
  expect(entries.length).toBeGreaterThan(150);
  const runtime = new Client({
    connectionString: scopedUrl(runtimeRole, runtimePassword),
  });
  await runtime.connect();
  await expect(
    runtime.query(
      `SELECT location_configuration_minor_unit_exponent('USD')
         AS exponent`,
    ),
  ).rejects.toMatchObject({ code: "42501" });
  await runtime.end();
  for (const [code, exponent] of [
    ...entries,
    ...(["AAA", "ZZZ"] as const).map(
      (unknown) => [unknown, null] as const,
    ),
  ]) {
    const result = await adminPool.query<{ exponent: number | null }>(
      `SELECT location_configuration_minor_unit_exponent($1) AS exponent`,
      [code],
    );
    expect(result.rows[0]!.exponent, code).toBe(exponent);
  }
  const subMinorCurrencies = entries.filter(
    ([, exponent]) => exponent !== null && exponent > 3,
  );
  expect(subMinorCurrencies.length).toBeGreaterThan(0);
  for (const [code, exponent] of subMinorCurrencies) {
    const result = await adminPool.query<{ exponent: number | null }>(
      `SELECT location_configuration_minor_unit_exponent($1) AS exponent`,
      [code],
    );
    expect(result.rows[0]!.exponent, code).toBe(exponent);
    expect(result.rows[0]!.exponent! > 3, code).toBe(true);
  }
});

it("accepts USD 1.200 and rejects USD 1.201 with no mutation or audit", async () => {
  const runtime = new Client({
    connectionString: scopedUrl(runtimeRole, runtimePassword),
  });
  await runtime.connect();
  try {
    const usd = currencyLocations.USD;
    const initial = await feeState(usd);
    const accepted = await runtimeSetFee(
      runtime,
      usd,
      "1.200",
      initial.token,
    );
    expect(accepted > initial.token).toBe(true);
    const afterAccept = await feeState(usd);
    expect(afterAccept.value).toBe("1.200");
    expect(afterAccept.audit_count).toBe(initial.audit_count + 1);

    await expect(
      runtimeSetFee(runtime, usd, "1.201", afterAccept.token),
    ).rejects.toMatchObject({ code: "22023" });
    const afterReject = await feeState(usd);
    expect(afterReject.value).toBe("1.200");
    expect(afterReject.token).toEqual(afterAccept.token);
    expect(afterReject.audit_count).toBe(afterAccept.audit_count);
  } finally {
    await runtime.end();
  }
});

it("accepts JOD 1.234 under its three-decimal minor unit", async () => {
  const runtime = new Client({
    connectionString: scopedUrl(runtimeRole, runtimePassword),
  });
  await runtime.connect();
  try {
    const jod = currencyLocations.JOD;
    const initial = await feeState(jod);
    const accepted = await runtimeSetFee(
      runtime,
      jod,
      "1.234",
      initial.token,
    );
    expect(accepted > initial.token).toBe(true);
    const state = await feeState(jod);
    expect(state.value).toBe("1.234");
    expect(state.audit_count).toBe(initial.audit_count + 1);
  } finally {
    await runtime.end();
  }
});

it("fails closed for unusable or unknown currency precision", async () => {
  const runtime = new Client({
    connectionString: scopedUrl(runtimeRole, runtimePassword),
  });
  await runtime.connect();
  try {
    const xau = currencyLocations.XAU;
    const initial = await feeState(xau);
    await expect(
      runtimeSetFee(runtime, xau, "1.000", initial.token),
    ).rejects.toMatchObject({ code: "22023" });
    const unchanged = await feeState(xau);
    expect(unchanged.value).toBeNull();
    expect(unchanged.token).toEqual(initial.token);
    expect(unchanged.audit_count).toBe(initial.audit_count);
  } finally {
    await runtime.end();
  }
});