import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const privateDir = join(root, "tmp", "wa310-runtime");
const recordPath = join(privateDir, "native-smoke-evidence.json");
const operator = JSON.parse(readFileSync(join(privateDir, "operator-private.json"), "utf8"));
const origin = "http://127.0.0.1:33110";
const evidence = existsSync(recordPath)
  ? JSON.parse(readFileSync(recordPath, "utf8"))
  : { locationId: operator.location, organizationId: operator.organization, stages: [] };
if (evidence.valetSessionId) {
  console.log("Issue310 native Check-In session already exists; no second intake will be attempted.");
  process.exit(0);
}
const save = () => writeFileSync(recordPath, JSON.stringify(evidence, null, 2),
  { encoding: "utf8", mode: 0o600 });
async function post(path, body, authorization) {
  const response = await fetch(new URL(path, origin), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authorization ? { authorization: `Bearer ${authorization}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = typeof result.code === "string" ? result.code : "UNSPECIFIED";
    throw new Error(`Request ${path} failed with HTTP ${response.status}, code ${code}`);
  }
  return result;
}

try {
  delete evidence.failure;
  const health = await fetch(new URL("/health/ready", origin), {
    signal: AbortSignal.timeout(5000),
  });
  if (!health.ok) throw new Error(`API readiness returned ${health.status}`);
  if (!evidence.stages.includes("API_READY")) evidence.stages.push("API_READY");

  const login = await post("/v1/staff/auth/native/login", operator.employee);
  if (typeof login.accessToken !== "string" || !login.accessToken.startsWith("vsa1.")) {
    throw new Error("Native staff login did not issue a valid access bearer.");
  }
  const access = login.accessToken;
  if (!evidence.stages.includes("EMPLOYEE_NATIVE_LOGIN")) evidence.stages.push("EMPLOYEE_NATIVE_LOGIN");

  if (!evidence.shiftId) {
    const shift = await post("/v1/staff/shifts/start", {
      targetLocationId: operator.location,
    }, access);
    evidence.shiftId = shift.shiftId;
    evidence.stages.push("EMPLOYEE_SHIFT_STARTED");
    save();
  }

  const intake = await post("/v1/staff/check-in/intakes", {
    targetLocationId: operator.location,
    intakeOperationId: randomUUID(),
    vehicleIdentity: {
      mode: "TEMPORARY_DESCRIPTOR",
      temporaryDescriptor: "WA310 synthetic vehicle",
    },
    customer: {
      intent: "DIFFERENT_CUSTOMER",
      displayName: "WA310 Synthetic Customer (no consent)",
      phone: "+962700000000",
    },
  }, access);
  evidence.valetSessionId = intake.valetSessionId;
  evidence.stages.push("REAL_CHECKIN_INTAKE_CREATED");
  save();

  await post(`/v1/staff/check-in/sessions/${intake.valetSessionId}/condition-completion`, {}, access);
  evidence.stages.push("CONDITION_COMPLETED");
  const completed = await post(`/v1/staff/check-in/sessions/${intake.valetSessionId}/complete`, {
    expectedVersion: intake.version,
  }, access);
  if (completed.state !== "AWAITING_PARKING") throw new Error("Unexpected Check-In state.");
  evidence.stages.push("CHECKIN_COMPLETED_AWAITING_PARKING");
  save();
  console.log(`Issue310 native smoke PASS: ${evidence.stages.join(" -> ")}; session ${evidence.valetSessionId}`);
} catch (error) {
  evidence.failure = error instanceof Error ? error.message : "Unknown smoke failure";
  save();
  console.error(`Issue310 native smoke stopped: ${evidence.failure}`);
  process.exitCode = 1;
}
