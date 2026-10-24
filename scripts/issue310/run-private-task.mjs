import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const credentialsPath = join(projectRoot, "tmp", "wa310-runtime", "compose.env");
const credentials = Object.fromEntries(readFileSync(credentialsPath, "utf8")
  .trim().split("\n").map((entry) => {
    const separator = entry.indexOf("=");
    if (separator < 1) throw new Error("Invalid isolated secret inventory.");
    return [entry.slice(0, separator), entry.slice(separator + 1).trim()];
  }));

function databaseUrl(role, secretName) {
  const password = credentials[secretName];
  if (!password || !/^[A-Za-z0-9_-]{32,}$/.test(password)) {
    throw new Error("Isolated database credentials are missing or malformed.");
  }
  return `postgresql://${role}:${encodeURIComponent(password)}@127.0.0.1:56310/vaylet_wa310`;
}

const env = {
  ...process.env,
  NODE_ENV: "test",
  DATABASE_URL: databaseUrl("wa310_api", "WA310_API_PASSWORD"),
  MIGRATION_DATABASE_URL: databaseUrl("wa310_migrate", "WA310_MIGRATION_PASSWORD"),
  OUTBOUND_MESSAGING_WORKER_DATABASE_URL: databaseUrl("wa310_sender", "WA310_SENDER_PASSWORD"),
  OUTBOUND_MESSAGING_WEBHOOK_DATABASE_URL: databaseUrl("wa310_webhook", "WA310_WEBHOOK_PASSWORD"),
  OUTBOUND_MESSAGING_MODE: "disabled",
  OUTBOUND_MESSAGING_SEND_ENABLED: "false",
  OUTBOUND_META_SANDBOX_ACTIVATION_ENABLED: "false",
  GUEST_ACCESS_AUTO_ISSUE_ENABLED: "false",
  OUTBOUND_META_TEST_DATABASE_NAME: "vaylet_wa310",
  VAYLET_ALLOW_DEMO_SEED: "false",
};

// Only one-time ACL provisioning needs bootstrap authority: the protected
// photo function has a distinct NOLOGIN owner and is deliberately not owned
// by the migration role. Migrations still use the non-superuser role.
if (["preparePhotoOwner", "provisionApi", "provisionOutbound"].includes(process.argv[2])) {
  env.MIGRATION_DATABASE_URL = databaseUrl("wa310_bootstrap", "WA310_BOOTSTRAP_PASSWORD");
}

const tasks = {
  migrate: ["pnpm", "--filter", "@valet/database", "migrate:deploy"],
  preparePhotoOwner: ["pnpm", "--filter", "@valet/database", "exec", "node", "scripts/issue310-photo-owner-bootstrap.mjs"],
  provisionApi: ["pnpm", "--filter", "@valet/database", "runtime:provision"],
  provisionOutbound: ["node", "packages/database/scripts/provision-outbound-principals.mjs"],
  migrationStatus: ["pnpm", "--filter", "@valet/database", "exec", "prisma", "migrate", "status"],
  bootstrapTenant: ["pnpm", "--filter", "@valet/api", "exec", "tsx", "tools/issue310/bootstrap-tenant.ts"],
  provisionMinio: ["pnpm", "--filter", "@valet/api", "exec", "tsx", "tools/issue310/provision-minio.ts"],
  dbPosture: ["pnpm", "--filter", "@valet/database", "exec", "node", "scripts/issue310-db-posture.mjs"],
};

const taskName = process.argv[2];
const selected = tasks[taskName];
if (!selected || process.argv.length !== 3) {
  throw new Error("Allowed Issue310 tasks: migrate, preparePhotoOwner, provisionApi, provisionOutbound, migrationStatus, bootstrapTenant, provisionMinio, dbPosture.");
}

const execution = process.platform === "win32"
  ? [process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", selected.join(" ")]]
  : [selected[0], selected.slice(1)];
const result = spawnSync(execution[0], execution[1], {
  cwd: projectRoot,
  env,
  stdio: "inherit",
  windowsHide: true,
});
if (result.error) throw new Error(`Isolated ${taskName} command failed to launch.`);
process.exitCode = result.status ?? 1;
