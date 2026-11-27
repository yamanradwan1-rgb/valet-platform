import { spawn, execFileSync } from "node:child_process";
import console from "node:console";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import process from "node:process";
import { clearTimeout, setTimeout } from "node:timers";
import { pathToFileURL, URL } from "node:url";
import { assertMigrationTarget } from "./issue463-browser-proof-migration.mjs";

const fixedRoles = Object.freeze({
  staff: "vaylet_staff_auth_writer",
  mfa: "vaylet_mfa_writer",
  management: "vaylet_management_writer",
  approver: "vaylet_rating_feedback_privacy_approver",
  executor: "vaylet_rating_feedback_privacy_executor",
});

export const P7_FEEDBACK_STAGES = Object.freeze([
  "PREPARE", "P2_TEST", "P5_TEST", "P5_TEST",
]);

export const P7_REQUIRED_FILES = Object.freeze([
  "apps/api/vitest.issue463-browser.config.mjs",
  "apps/api/test/issue463-rating-comments.browser.proof.ts",
  "apps/api/test/issue463-browser-target.ts",
  "apps/api/test/issue463-browser-seed.ts",
  "apps/api/test/issue463-browser-apps.ts",
  "packages/database/scripts/provision-rating-feedback-role.mjs",
  "packages/database/scripts/provision-option-c-protected-cutover.mjs",
  "packages/database/scripts/provision-runtime-role.mjs",
  "packages/database/scripts/provision-s04-proof-key.mjs",
  "packages/database/scripts/provision-staff-auth-writer-role.mjs",
  "packages/database/prisma/migrations/20261127000100_issue463_guest_rating_comments_p2/migration.sql",
  "packages/database/prisma/migrations/20261127000200_issue463_management_feedback_reader_p5/migration.sql",
]);

function git(root, args) {
  return execFileSync("git", ["-c", "maintenance.auto=false",
    "-c", "gc.auto=0", ...args], {
    cwd: root, encoding: "utf8", timeout: 20000,
    windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export async function checkIntegratedCandidate(root, expectedSha) {
  if (!/^[0-9a-f]{40}$/.test(expectedSha ?? "")) {
    throw new Error("Issue463 P7 requires an explicit exact integrated commit SHA.");
  }
  if (git(root, ["rev-parse", "HEAD"]) !== expectedSha ||
      git(root, ["status", "--porcelain"]) !== "") {
    throw new Error("Issue463 P7 refuses an uncommitted or different candidate.");
  }
  for (const file of P7_REQUIRED_FILES) {
    if (!existsSync(join(root, file))) {
      throw new Error("Issue463 integrated candidate missing: " + file);
    }
  }
  const module = await import(pathToFileURL(join(root,
    "packages/database/scripts/rating-feedback-stage-contract.mjs")).href);
  assertFixedRoleContract(module.feedbackRoles);
  const migrationDir = join(root, "packages/database/prisma/migrations");
  const entries = readdirSync(migrationDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  if (entries.length < 157) {
    throw new Error("Issue463 P7 requires merged P2 and P5 migrations.");
  }
  for (const [packageName, dependency] of [
    ["database", "pg"], ["database", "prisma"],
    ["api", "vitest"], ["dashboard", "@playwright/test"],
  ]) {
    try {
      createRequire(join(root, packageName === "database"
        ? "packages/database/package.json"
        : "apps/" + packageName + "/package.json")).resolve(dependency);
    } catch {
      throw new Error("Issue463 missing pinned " + packageName +
        " dependency: " + dependency);
    }
  }
  for (const [packageName, dependency, version] of [
    ["database", "prisma", "7.9.1"],
    ["api", "vitest", "4.1.10"],
    ["api", "@nestjs/core", "11.1.28"],
    ["dashboard", "@playwright/test", "1.62.1"],
    ["dashboard", "next", "16.4.3"],
  ]) {
    const manifest = join(root, packageName === "database"
      ? "packages/database/package.json"
      : "apps/" + packageName + "/package.json");
    const installed = createRequire(manifest)(dependency + "/package.json");
    if (installed.version !== version) {
      throw new Error("Issue463 installed " + dependency + " differs from pinned version.");
    }
  }
  const dashboard = createRequire(join(root, "apps/dashboard/package.json"));
  const { chromium } = dashboard("@playwright/test");
  if (!existsSync(chromium.executablePath())) {
    throw new Error("Issue463 pinned Playwright Chromium binary missing.");
  }
  return { sha: expectedSha, migrationCount: entries.length };
}

export function assertFixedRoleContract(roles) {
  if (!roles ||
      roles.approver !== fixedRoles.approver ||
      roles.executor !== fixedRoles.executor ||
      roles.sessionLocker !== "vaylet_staff_session_lock_owner" ||
      roles.reader !== "vaylet_rating_feedback_reader_owner" ||
      roles.privacy !== "vaylet_rating_feedback_privacy_owner") {
    throw new Error("Issue463 W1/W2 privacy A/E or function owner roles disagree.");
  }
}

function secret() { return randomBytes(32).toString("base64url"); }

export function newP7Passwords() {
  return Object.freeze({
    postgres: secret(), migrator: secret(), runtime: secret(),
    staff: secret(), mfa: secret(), management: secret(),
    approver: secret(), executor: secret(),
  });
}

function safeEnvironment(root) {
  const allowed = new Set([
    "path", "pathext", "systemroot", "windir", "temp", "tmp",
    "userprofile", "appdata", "localappdata", "homedrive",
    "homepath", "pnpm_home", "home", "lang", "comspec",
    "processor_architecture", "number_of_processors", "npm_config_store_dir",
  ]);
  const result = Object.fromEntries(Object.entries(process.env)
    .filter(([name]) => allowed.has(name.toLowerCase())));
  return {
    ...result, NODE_ENV: "test", NEXT_TELEMETRY_DISABLED: "1",
    // Existing dotenv/config consumers may not read .env or outside secrets.
    DOTENV_CONFIG_PATH: join(root, "apps/api/tools/.issue463-p7-no-external-env"),
  };
}

export function createP7Credentials(root, owner, target, database, passwords) {
  const proofSecrets = {
    ANTI_ABUSE_SQL_PROOF_SECRET_B64URL: secret(),
    ANTI_ABUSE_HMAC_SECRET_B64URL: secret(),
    MFA_ACTIVITY_PROOF_SECRET_B64URL: secret(),
  };
  const url = (role, password) => {
    const result = new URL("postgresql://127.0.0.1:" + target.port + "/" + database);
    result.username = role;
    result.password = password;
    return result.toString();
  };
  const env = {
    ...safeEnvironment(root),
    ISSUE463_BROWSER_QA: "I_OWN_DISPOSABLE_463",
    ISSUE463_P7_OWNER: owner,
    ISSUE463_P7_CONTAINER: target.id,
    ISSUE463_P7_CANDIDATE: target.candidate,
    RATING_FEEDBACK_ATTESTED_DATABASE: database,
    RATING_FEEDBACK_ATTESTED_SYSTEM_IDENTIFIER: target.systemId,
    MIGRATION_DATABASE_URL: url("issue463_p7_migrator", passwords.migrator),
    DATABASE_URL: url("issue463_p7_runtime", passwords.runtime),
    STAFF_AUTH_WRITER_DATABASE_URL: url(fixedRoles.staff, passwords.staff),
    MFA_WRITER_DATABASE_URL: url(fixedRoles.mfa, passwords.mfa),
    MANAGEMENT_WRITER_DATABASE_URL: url(fixedRoles.management, passwords.management),
    RATING_FEEDBACK_APPROVER_DATABASE_URL: url(fixedRoles.approver, passwords.approver),
    RATING_FEEDBACK_EXECUTOR_DATABASE_URL: url(fixedRoles.executor, passwords.executor),
    ...proofSecrets,
    MFA_PROTECTED_WRITER_ENABLED: "true",
    OPTION_C_PROTECTED_CUTOVER: "1",
    OPTION_C_LEGACY_WORKERS_DRAINED: "1",
    RATING_FEEDBACK_INSTALLED: "P5",
    ANTI_ABUSE_TRUSTED_PROXY_CIDRS: "",
  };
  if (new Set(Object.values(passwords).concat(Object.values(proofSecrets))).size !== 11) {
    throw new Error("Issue463 generated credentials are not distinct.");
  }
  return { env, passwords };
}

export async function runP7Step(root, name, command, args, env, state, timeoutMs) {
  if (state.interrupted) throw new Error("Issue463 P7 interrupted before " + name);
  await new Promise((done, fail) => {
    const windows = process.platform === "win32";
    const cmd = windows && command === "pnpm" ? "cmd.exe" : command;
    const argv = windows && command === "pnpm"
      ? ["/d", "/c", "pnpm.cmd", ...args] : args;
    const child = spawn(cmd, argv, {
      cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    });
    state.child = child;
    const milestones = new Set();
    const permitted = [
      "TARGET_ATTESTED", "API_READY", "LEGACY_ABI", "NOTICE_DENIED",
      "APPS_READY", "GUEST_COMMITTED", "DASHBOARD_DISCLOSED", "READ_SCOPE_PARITY",
    ];
    let stdout = "";
    child.stdout?.on("data", (chunk) => {
      stdout = (stdout + chunk.toString("utf8")).slice(-24000);
      if (name === "real Issue463 browser proof") {
        for (const item of permitted) {
          if (!milestones.has(item) &&
              stdout.includes("P7_MILESTONE " + item)) {
            milestones.add(item);
            console.log("P7_MILESTONE " + item);
          }
        }
      }
    });
    let finished = false;
    const stop = () => {
      if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
      if (windows) {
        try { execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
          stdio: "ignore", timeout: 5000, windowsHide: true,
        }); } catch { /* final termination outcome checked below */ }
      } else child.kill("SIGTERM");
    };
    state.stopChild = stop;
    const deadline = setTimeout(() => { state.interrupted = true; stop(); }, timeoutMs);
    const close = (error) => {
      if (finished) return;
      finished = true; clearTimeout(deadline); state.child = null;
      state.stopChild = null;
      if (error) {
        fail(error);
      } else if (name.endsWith(".mjs") && name.startsWith("issue463-") &&
          !/"result":"PASS","assertions":(?:230|22|7|52)(?:,|\})/u.test(stdout)) {
        fail(new Error("Issue463 SQL proof did not report its assertion receipt: " + name));
      } else if (name === "real Issue463 browser proof" &&
          !/Tests\s+1 passed\s+\(1\)/u.test(
            stdout.replaceAll("\u001b", "").replace(/\[[0-9;]*m/gu, ""),
          )) {
        fail(new Error("Issue463 browser suite did not prove exactly one passing E2E test."));
      } else { console.log("PASS " + name); done(); }
    };
    // Never print subprocess output: it could contain URI secrets or raw Guest text.
    child.stderr?.resume();
    child.once("error", () => close(new Error("Issue463 failed starting " + name)));
    child.once("close", (code) => close(
      code === 0 && !state.interrupted ? undefined :
        new Error("Issue463 " + name + " failed (exit=" + code + ")."),
    ));
  });
}

export async function provisionP7(root, env, state) {
  const databaseRoot = join(root, "packages/database");
  const timeout = 600000;
  await runP7Step(root, "official Prisma migrate deploy",
    "pnpm", ["--filter", "@valet/database", "migrate:deploy"], env, state, timeout);
  const count = await assertMigrationTarget(root, env, true);
  console.log("PASS verified " + count + " official migration checksums");
  for (const file of [
    "provision-s04-proof-key.mjs",
    "provision-runtime-role.mjs",
    "provision-staff-auth-writer-role.mjs",
  ]) {
    await runP7Step(databaseRoot, file, process.execPath,
      ["scripts/" + file], env, state, timeout);
  }
  const script = "scripts/provision-rating-feedback-role.mjs";
  await runP7Step(databaseRoot, "rating feedback PREPARE (dormant LEGACY)",
    process.execPath, [script], { ...env, RATING_FEEDBACK_STAGE: "PREPARE" },
    state, timeout);
  await runP7Step(databaseRoot, "Option C protected cutover",
    process.execPath, ["scripts/provision-option-c-protected-cutover.mjs"],
    env, state, timeout);
  for (const stage of P7_FEEDBACK_STAGES.slice(1)) {
    await runP7Step(databaseRoot, "rating feedback " + stage,
      process.execPath, [script], { ...env, RATING_FEEDBACK_STAGE: stage },
      state, timeout);
  }
}
