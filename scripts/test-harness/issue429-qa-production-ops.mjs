import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";
import { issue429ProductionChildEnvironment } from "./issue429-qa-production-child-env.mjs";
import { issue429SyntheticJpeg } from "./issue429-qa-synthetic-jpeg.mjs";
import { startIssue429TrackedChild } from "./issue429-qa-child-lifecycle.mjs";

const requireApi = createRequire(new URL("../../apps/api/package.json", import.meta.url));

async function reserveCandidatePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitReady(origin, child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error("Production API exited before readiness.");
    try {
      const response = await fetch(`${origin}/health/ready`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.status === 200) return;
    } catch { /* API startup can take time. */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Production API failed its real health/readiness deadline.");
}

/** The child is actual dist/main.js, NODE_ENV=production, independent OS PID. */
export async function startIssue429ProductionApi({
  distributionPath, runtimeUrl, mockEndpoint, token, caPath,
  databaseCa, root, onSpawn,
}) {
  if (typeof onSpawn !== "function") {
    throw new Error("Issue429 API requires an owned-child registration callback.");
  }
  const port = await reserveCandidatePort();
  const origin = `http://127.0.0.1:${port}`;
  const env = issue429ProductionChildEnvironment({
    systemEnvironment: process.env,
    port,
    runtimeUrl,
    databaseCa,
    mockEndpoint,
    token,
    caPath,
  });
  const child = spawn(process.execPath, [distributionPath], {
    cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  });
  // Never echo startup stdout/stderr: this harness handles credentials.
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  const owner = await startIssue429TrackedChild(
    child, () => waitReady(origin, child),
    (tracked) => onSpawn({ ...tracked, origin }),
  );
  return { ...owner, origin };
}

export async function requestIssue429PlateOcr(origin, actor, locationId, {
  invalidMime = false,
  noBearer = false,
} = {}) {
  const form = new FormData();
  form.append("targetLocationId", locationId);
  form.append("plateCountry", "JO");
  form.append("image",
    new Blob([new Uint8Array(issue429SyntheticJpeg())],
      { type: invalidMime ? "image/png" : "image/jpeg" }), "synthetic.jpg");
  const started = performance.now();
  const response = await fetch(`${origin}/v1/staff/check-in/plate-ocr`, {
    method: "POST",
    headers: noBearer ? {} : { Authorization: `Bearer ${actor.accessToken}` },
    body: form,
    signal: AbortSignal.timeout(15000),
  });
  let publicOutcome = null;
  let publicPayloadSafe = false;
  try {
    const parsed = await response.json();
    if (["MATCH", "NO_MATCH", "UNAVAILABLE"].includes(parsed?.status)) {
      publicOutcome = parsed.status;
      const keys = Object.keys(parsed).sort();
      publicPayloadSafe = parsed.status === "MATCH"
        ? keys.join(",") === "candidate,status"
        : keys.join(",") === "status";
    }
  } catch { /* 401/400 responses intentionally have no OCR result union. */ }
  return { status: response.status, publicOutcome,
    publicPayloadSafe,
    elapsedMs: performance.now() - started,
    noStore: response.headers.get("cache-control")?.includes("no-store") ?? false };
}

/** Separate operator connection observes committed data, not an API spy. */
export async function openIssue429Ledger(adminUrl, runtimeUrl, databaseCa) {
  // Defer the driver import until every environment/target fence has passed.
  const pg = requireApi("pg");
  const scopedAdminUrl = new URL(adminUrl);
  scopedAdminUrl.pathname = new URL(runtimeUrl).pathname;
  const admin = new pg.Client({
    connectionString: scopedAdminUrl.toString(), connectionTimeoutMillis: 4000,
  });
  const runtime = new pg.Client({ connectionString: runtimeUrl,
    connectionTimeoutMillis: 4000,
    ssl: { ca: databaseCa, rejectUnauthorized: true } });
  await admin.connect();
  try {
    await runtime.connect();
    const ready = await runtime.query(
      `SELECT current_setting('server_version_num')::integer AS version,
         current_database() AS database, current_user AS role,
         ssl.ssl, ssl.version AS tls_version
       FROM pg_stat_ssl AS ssl WHERE ssl.pid=pg_backend_pid()`,
    );
    const dbName = new URL(runtimeUrl).pathname.slice(1);
    const db = ready.rows[0];
    if (db?.version < 170000 || db.version >= 180000 ||
        db.database !== dbName || db.ssl !== true ||
        !["TLSv1.2", "TLSv1.3"].includes(db.tls_version)) {
      throw new Error("Production runtime PG17 TLS or database identity mismatch.");
    }
    return {
      admin, runtime, database: db.database, role: db.role,
      async close() {
        const endings = await Promise.allSettled([runtime.end(), admin.end()]);
        if (endings.some((result) => result.status === "rejected")) {
          throw new Error("Issue429 QA PostgreSQL client closure unconfirmed.");
        }
      },
    };
  } catch (error) {
    await runtime.end().catch(() => {});
    await admin.end().catch(() => {});
    throw error;
  }
}

export async function observeIssue429Debits(admin, organizations) {
  const platform = await admin.query(
    `SELECT platform.enabled, period.id AS period_id,
        period.quota_units, period.spent_units
     FROM public.ocr_platform_control AS platform
     LEFT JOIN public.ocr_budget_periods AS period
       ON period.id=platform.active_period_id WHERE platform.id=1`,
  );
  const period = platform.rows[0];
  if (period?.enabled !== true || !period.period_id) {
    throw new Error("Synthetic OCR controls not enabled through reviewed operator path.");
  }
  const tenants = {};
  for (const org of new Set(organizations)) {
    const result = await admin.query(
      `SELECT control.enabled, allocation.quota_units, allocation.spent_units
       FROM public.ocr_organization_control AS control
       JOIN public.ocr_organization_allocations AS allocation
         ON allocation.organization_id=control.organization_id
       WHERE control.organization_id=$1 AND allocation.period_id=$2`,
      [org, period.period_id],
    );
    if (result.rows[0]?.enabled !== true) {
      throw new Error("Expected QA tenant is not budget-enabled.");
    }
    tenants[org] = Number(result.rows[0].spent_units);
  }
  return { global: Number(period.spent_units), tenants };
}
