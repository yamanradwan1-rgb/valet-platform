import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import pg from "pg";

const operation = process.argv[2];
const root = process.env.WA310_PRIVATE_RUNTIME_DIR;
if (!root || basename(resolve(root)) !== "wa310-runtime" ||
    basename(dirname(resolve(root))) !== "tmp" ||
    !["--issue-one", "--send-one", "--safe-off", "--diagnose", "--provision-budget"].includes(operation)) {
  throw new Error("Use only the isolated Issue310 one-send operator modes.");
}
const entries = (filename) => Object.fromEntries(readFileSync(resolve(root, filename), "utf8")
  .trim().split(/\r?\n/).map((row) => {
    const index = row.indexOf("=");
    if (index < 1) throw new Error("Invalid protected Issue310 configuration.");
    return [row.slice(0, index), row.slice(index + 1)];
  }));
const composeEnv = entries("compose.env");
const senderEnv = entries("sender.env");
const apiEnv = entries("api.env");
const operator = JSON.parse(readFileSync(resolve(root, "operator-private.json"), "utf8"));
const organizationId = "5072955f-f323-448f-8d7d-bd0d3e6bd0b4";
const locationId = "ac34adc7-1d76-42cb-af29-fef22feaa909";
if (operator.organization !== organizationId || operator.location !== locationId ||
    !/^\+9627\d{8}$/.test(senderEnv.OUTBOUND_META_TEST_RECIPIENT_E164 ?? "") ||
    !/^[-_A-Za-z0-9]{32,}$/.test(composeEnv.WA310_MIGRATION_PASSWORD ?? "")) {
  throw new Error("Issue310 operator or recipient authority is invalid.");
}
const recipient = senderEnv.OUTBOUND_META_TEST_RECIPIENT_E164;
const stateFile = resolve(root, "one-send-operator-private.json");
const connection = new URL("postgresql://wa310_migrate@127.0.0.1:56310/vaylet_wa310");
connection.password = composeEnv.WA310_MIGRATION_PASSWORD;
const db = new pg.Client({ connectionString: connection.toString() });
const base = ["compose", "-p", "vaylet-wa310", "-f", "deploy/issue310/compose.yaml"];
const sidecar = ["-f", "deploy/issue310/compose.tailscale-service.yaml"];
const secret = ["-f", "deploy/issue310/compose.authorized-send.yaml"];
const cli = (args, env) => execFileSync("docker", args, {
  encoding: "utf8", timeout: 120_000, maxBuffer: 16_384,
  windowsHide: true, ...(env ? { env: { ...process.env, ...env } } : {}),
});
const up = (overlays, services, env) => cli([
  ...base, ...overlays, "--env-file", "tmp/wa310-runtime/compose.env",
  "--profile", "wa310-tailnet", "up", "-d", "--no-deps", "--force-recreate",
  ...services,
], env);
// The tagged tailnet identity has its own edge namespace and must survive API
// restarts; this avoids a new Service-approval cycle during live issuance.
const appServices = ["api", "customer", "dashboard"];
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const dbIdentity = async () => {
  const row = await one("SELECT current_database() AS db,current_user AS principal");
  if (row?.db !== "vaylet_wa310" || row.principal !== "wa310_migrate") {
    throw new Error("This operation can only access the new Issue310 database.");
  }
};
const controls = async (issue, send) => {
  await db.query("BEGIN");
  try {
    await dbIdentity();
    const rows = await db.query("SELECT environment,issue_enabled,send_enabled FROM outbound_messaging_control FOR UPDATE");
    if (rows.rowCount !== 2 || rows.rows.some((r) =>
      r.environment === "production" && (r.issue_enabled || r.send_enabled))) {
      throw new Error("Production controls are not OFF; refusing test mutation.");
    }
    if (!rows.rows.some((r) => r.environment === "test")) {
      throw new Error("Missing exact isolated test control.");
    }
    await db.query(`UPDATE outbound_messaging_control
      SET issue_enabled=$1,send_enabled=$2,revision=revision+1,
        updated_at=clock_timestamp() WHERE environment='test'`, [issue, send]);
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  }
};
const assertEmpty = async () => {
  const row = await one(`SELECT
    (SELECT count(*)::int FROM outbound_message_intents WHERE organization_id=$1) AS intents,
    (SELECT count(*)::int FROM outbound_message_deliveries WHERE organization_id=$1) AS deliveries,
    (SELECT count(*)::int FROM outbound_message_attempts WHERE organization_id=$1) AS attempts`,
  [organizationId]);
  if (row.intents !== 0 || row.deliveries !== 0 || row.attempts !== 0) {
    throw new Error("One-send operation already has outbound work; no repeat intake allowed.");
  }
};
const post = async (path, body, accessToken) => {
  const response = await fetch(`http://127.0.0.1:33110${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://127.0.0.1:33113",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) },
    body: JSON.stringify(body), signal: AbortSignal.timeout(18_000),
  });
  if (!response.ok) {
    throw new Error(`Issue310 employee API ${path} rejected HTTP ${response.status}.`);
  }
  return response.json();
};
const login = async () => {
  const result = await post("/v1/staff/auth/login", operator.employee);
  if (!/^vsa1\.[A-Za-z0-9_-]{43}$/.test(result.accessToken ?? "")) {
    throw new Error("Authorized employee login failed its exact credential contract.");
  }
  return result.accessToken;
};
const status = async () => one(`SELECT d.state,d.attempt_count,d.max_attempts,
  d.lease_expires_at < clock_timestamp() AS lease_expired,
  (SELECT count(*)::int FROM outbound_message_attempts a WHERE a.delivery_id=d.id) AS attempts,
  (SELECT count(*)::int FROM outbound_message_intents i WHERE i.organization_id=$1) AS intents
  FROM outbound_message_deliveries d WHERE d.organization_id=$1`, [organizationId]);
const safe = async () => {
  // SQL controls are shut first, before any Docker restart or possible timeout.
  await controls(false, false);
  if (operation !== "--issue-one") {
    try { cli(["stop", "-t", "3", "vaylet-wa310-sender-1"]); }
    finally { up([], ["sender"]); }
  }
  console.log("Test and production durable issue/send controls: OFF/OFF.");
};

await db.connect();
try {
  await dbIdentity();
  if (operation === "--safe-off") {
    await safe();
  } else if (operation === "--provision-budget") {
    // Scoped operator provisioning, not a dispatch bypass: verified binding,
    // durable controls OFF, and a proven pre-permit failure (zero attempts).
    await db.query("BEGIN");
    try {
      const check = await one(`SELECT b.id,
        (SELECT count(*)::int FROM outbound_message_deliveries d
          WHERE d.organization_id=b.organization_id AND d.state='LEASED'
          AND d.lease_expires_at < clock_timestamp() AND d.attempt_count=0) AS expired_zero_attempt_leases,
        (SELECT count(*)::int FROM outbound_message_attempts a
          WHERE a.organization_id=b.organization_id) AS attempts,
        (SELECT count(*)::int FROM outbound_message_budgets budget
          WHERE budget.provider_binding_id=b.id) AS existing_budget,
        (SELECT count(*)::int FROM outbound_messaging_control c
          WHERE c.issue_enabled OR c.send_enabled) AS enabled_controls
        FROM outbound_provider_bindings b WHERE b.organization_id=$1
          AND b.id='6e76369a-3c9b-4bb4-89b1-7f3d0fdda078'
          AND b.provider='META_CLOUD' AND b.environment='test'
          AND b.purpose='INITIAL_GUEST_ACCESS' AND b.enabled
          AND b.provider_verified_at IS NOT NULL
          AND b.waba_id='3491682417667249'
          AND b.phone_number_id='1426684017189271' FOR UPDATE OF b`, [organizationId]);
      if (check?.expired_zero_attempt_leases !== 1 || check.attempts !== 0 ||
          check.existing_budget !== 0 || check.enabled_controls !== 0) {
        throw new Error("Budget provisioning requires one proven pre-permit lease and both sends OFF.");
      }
      const inserted = await db.query(`INSERT INTO outbound_message_budgets
        (provider_binding_id,capacity,tokens,refill_per_second)
        VALUES($1,1,1,0.001) RETURNING provider_binding_id`, [check.id]);
      if (inserted.rowCount !== 1) throw new Error("Isolated budget setup failed.");
      await db.query("COMMIT");
      console.log("PASS: exactly one token of approved test binding budget provisioned; no dispatch enabled.");
    } catch (error) {
      await db.query("ROLLBACK").catch(() => {});
      throw error;
    }
  } else if (operation === "--diagnose") {
    // Read only; no activation, claims, provider calls or secret material printed.
    const result = await one(`SELECT d.state,d.attempt_count,d.max_attempts,
      d.lease_expires_at < clock_timestamp() AS lease_expired,
      i.expires_at > clock_timestamp() AS intent_valid,
      i.recipient_digest,
      s.customer_id=i.customer_id AS customer_ok,
      s.customer_access_generation=i.credential_generation AS generation_ok,
      s.customer_access_revoked_at IS NULL AS not_revoked,
      s.customer_access_consumed_at IS NULL AS not_consumed,
      s.customer_access_expires_at > clock_timestamp() AS guest_valid,
      p.revision=i.permission_revision AND p.withdrawn_at IS NULL AS consent_revision_ok,
      b.revision=i.binding_revision AND b.enabled AND b.provider_verified_at IS NOT NULL AS binding_ok,
      (SELECT count(*)::int FROM outbound_message_attempts a WHERE a.delivery_id=d.id) AS attempts
      FROM outbound_message_deliveries d
      JOIN outbound_message_intents i ON i.id=d.intent_id
      JOIN valet_sessions s ON s.id=i.valet_session_id
      JOIN outbound_messaging_permissions p ON p.id=i.permission_id
      JOIN outbound_provider_bindings b ON b.id=i.provider_binding_id
      WHERE d.organization_id=$1`, [organizationId]);
    const version = senderEnv.OUTBOUND_RECIPIENT_HMAC_KEY_VERSION;
    const encoded = senderEnv.OUTBOUND_RECIPIENT_HMAC_KEY_BASE64;
    const key = encoded ? Buffer.from(encoded, "base64") : Buffer.alloc(0);
    const expectedDigest = key.length >= 32 && /^v\d+$/.test(version ?? "")
      ? `hmac:${version}:${createHmac("sha256", key).update(recipient).digest("base64url")}`
      : null;
    const publicState = {
      state: result?.state ?? "MISSING", attempt_count: result?.attempt_count ?? null,
      max_attempts: result?.max_attempts ?? null, lease_expired: result?.lease_expired ?? null,
      attempts: result?.attempts ?? null,
      intent_valid: result?.intent_valid ?? null,
      customer_ok: result?.customer_ok ?? null,
      generation_ok: result?.generation_ok ?? null,
      not_revoked: result?.not_revoked ?? null,
      not_consumed: result?.not_consumed ?? null,
      guest_valid: result?.guest_valid ?? null,
      consent_revision_ok: result?.consent_revision_ok ?? null,
      binding_ok: result?.binding_ok ?? null,
      sender_digest_matches_intent: expectedDigest !== null && expectedDigest === result?.recipient_digest,
      api_sender_digest_key_equal: encoded === apiEnv.OUTBOUND_RECIPIENT_HMAC_KEY_BASE64 &&
        version === apiEnv.OUTBOUND_RECIPIENT_HMAC_KEY_VERSION,
    };
    console.log(JSON.stringify(publicState, null, 2));
  } else if (operation === "--issue-one") {
    if (existsSync(stateFile)) throw new Error("One-send operator state already exists; no second intake.");
    await assertEmpty();
    const started = { intent: "ONE_NATIVE_CHECK_IN", intakeOperationId: `intake:${randomUUID()}` };
    writeFileSync(stateFile, JSON.stringify(started), { flag: "wx", mode: 0o600 });
    try {
      cli(["stop", "-t", "3", "vaylet-wa310-sender-1"]);
      await controls(true, false);
      up([...sidecar, "-f", "deploy/issue310/compose.issue-once.yaml"], appServices);
      const token = await login();
      // This normal Intake API operation reuses/creates the *authorized* Customer.
      // It never changes the phone on a different stored Customer through SQL.
      const intake = await post("/v1/staff/check-in/intakes", {
        intakeOperationId: started.intakeOperationId,
        targetLocationId: locationId,
        customer: { intent: "DIFFERENT_CUSTOMER", phone: recipient },
        vehicleIdentity: { mode: "TEMPORARY_DESCRIPTOR", temporaryDescriptor: `WA310 ${randomUUID()}` },
      }, token);
      if (intake.state !== "CHECKING_IN" || intake.version !== 1 ||
          !/^[0-9a-f-]{36}$/i.test(intake.valetSessionId ?? "")) {
        throw new Error("The Native Intake result violates the expected session contract.");
      }
      started.sessionId = intake.valetSessionId;
      writeFileSync(stateFile, JSON.stringify(started), { mode: 0o600 });
      const delivered = await status();
      if (delivered?.intents !== 1 || delivered.state !== "PENDING" ||
          delivered.attempts !== 0) {
        throw new Error("Native Intake did not generate exactly one protected outbound intent.");
      }
      console.log("PASS: one authenticated Native Intake, one protected Guest issuance and one PENDING outbound intent.");
      // Complete the actual Check-In while no provider sending is allowed.
      await post(`/v1/staff/check-in/sessions/${started.sessionId}/condition-completion`, {}, token);
      const completed = await post(`/v1/staff/check-in/sessions/${started.sessionId}/complete`,
        { expectedVersion: 1 }, token);
      if (completed.state !== "AWAITING_PARKING" || completed.version !== 2) {
        throw new Error("Actual Native Check-In did not reach AWAITING_PARKING.");
      }
      started.completed = true;
      writeFileSync(stateFile, JSON.stringify(started), { mode: 0o600 });
      console.log("PASS: authorized Native Check-In completed (session identifier private).");
    } finally {
      await controls(false, false);
      up(sidecar, appServices);
      console.log("Auto-issuance returned OFF; Sender stayed stopped.");
    }
  } else {
    const saved = JSON.parse(readFileSync(stateFile, "utf8"));
    const before = await status();
    if (saved.intent !== "ONE_NATIVE_CHECK_IN" || saved.completed !== true ||
        !saved.sessionId || saved.sendWindowStartedAt || before?.intents !== 1 ||
        !(before.state === "PENDING" ||
          (before.state === "LEASED" && before.lease_expired === true)) ||
        before.attempt_count !== 0 || before.attempts !== 0) {
      throw new Error("A single Check-In with zero SQL attempts and no transport is required.");
    }
    const budget = await one(`SELECT count(*)::int AS count FROM outbound_message_budgets
      WHERE provider_binding_id='6e76369a-3c9b-4bb4-89b1-7f3d0fdda078'
        AND capacity=1 AND tokens=1 AND refill_per_second=0.001`);
    if (budget?.count !== 1) throw new Error("Single sandbox dispatch budget is not ready.");
    saved.sendWindowStartedAt = new Date().toISOString();
    writeFileSync(stateFile, JSON.stringify(saved), { mode: 0o600 });
    // Max one SQL attempt, even for a definitive provider rejection or rate-limit.
    const capped = await db.query(`UPDATE outbound_message_deliveries SET max_attempts=1
      WHERE organization_id=$1 AND state IN ('PENDING','LEASED') AND attempt_count=0
      RETURNING id`, [organizationId]);
    if (capped.rowCount !== 1) throw new Error("Unable to cap dispatch at one attempt.");
    const deadline = new Date(Date.now() + 180_000).toISOString();
    try {
      up([...secret, "-f", "deploy/issue310/compose.send-once.yaml"], ["sender"], {
        WA310_SEND_DEADLINE: deadline,
      });
      await controls(false, true);
      console.log("One-attempt test dispatch enabled; private token and short deadline restricted to Sender.");
      const end = Date.now() + 50_000;
      let result;
      while (Date.now() < end) {
        result = await status();
        if (result?.state === "ACCEPTED" || result?.state === "UNKNOWN" ||
            result?.state === "PERMANENT_FAILURE" || result?.state === "SUPPRESSED" ||
            result?.state === "EXPIRED" || result?.state === "RETRY_WAIT") break;
        await new Promise((resolveWait) => setTimeout(resolveWait, 400));
      }
      const final = result?.state ?? "NO_FINAL_STATE";
      console.log(`Single provider attempt: ${final}; SQL attempts=${result?.attempts ?? "unknown"}.`);
      if (result?.attempts > 1) throw new Error("Multiple provider attempts detected.");
      if (final !== "ACCEPTED") throw new Error("No Meta acceptance proven; do not retry this attempt.");
      console.log("Meta HTTP acceptance persisted. Actual handset receipt/Guest session still require separate proof.");
    } finally {
      await safe();
    }
  }
} finally {
  await db.end();
}
