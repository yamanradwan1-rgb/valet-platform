import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import { assertLocalDocker, assertOwnedContainer } from "./issue463-browser-proof-docker.mjs";
import { assertMigrationTarget } from "./issue463-browser-proof-migration.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export async function assertP7SqlTarget(env = process.env) {
  const owner = env.ISSUE463_P7_OWNER;
  const id = env.ISSUE463_P7_CONTAINER;
  const sha = env.ISSUE463_P7_CANDIDATE;
  const database = "issue463_p7_" + owner?.slice(0, 12);
  if (env.NODE_ENV !== "test" || env.CI !== undefined ||
      env.ISSUE463_BROWSER_QA !== "I_OWN_DISPOSABLE_463" ||
      env.RATING_FEEDBACK_STAGE !== "P5_TEST" ||
      !/^[a-f0-9]{32}$/.test(owner ?? "") || !/^[a-f0-9]{64}$/.test(id ?? "") ||
      !/^[a-f0-9]{40}$/.test(sha ?? "") ||
      env.RATING_FEEDBACK_ATTESTED_DATABASE !== database ||
      !/^\d{15,20}$/.test(env.RATING_FEEDBACK_ATTESTED_SYSTEM_IDENTIFIER ?? "")) {
    throw new Error("Issue463 integrated SQL proof requires its owned P7 target.");
  }
  const git = args => execFileSync("git", args, {
    cwd: root, encoding: "utf8", timeout: 10000, windowsHide: true,
  }).trim();
  if (git(["rev-parse", "HEAD"]) !== sha || git(["status", "--porcelain"]) !== "") {
    throw new Error("Issue463 SQL proof requires exact clean candidate.");
  }
  assertLocalDocker();
  const inspect = JSON.parse(execFileSync("docker", ["inspect", id], {
    encoding: "utf8", timeout: 10000, windowsHide: true,
  }));
  if (inspect.length !== 1) throw new Error("Issue463 ambiguous container.");
  const port = assertOwnedContainer(inspect[0], id, owner);
  for (const [key, role] of [
    ["MIGRATION_DATABASE_URL", "issue463_p7_migrator"],
    ["DATABASE_URL", "issue463_p7_runtime"],
    ["RATING_FEEDBACK_APPROVER_DATABASE_URL", "vaylet_rating_feedback_privacy_approver"],
    ["RATING_FEEDBACK_EXECUTOR_DATABASE_URL", "vaylet_rating_feedback_privacy_executor"],
  ]) {
    const url = new URL(env[key]);
    if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" ||
        url.port !== String(port) || url.pathname !== "/" + database ||
        url.username !== role || !url.password || url.search || url.hash) {
      throw new Error("Issue463 SQL URL outside owned target: " + key);
    }
  }
  const system = execFileSync("docker", [
    "exec", id, "psql", "-X", "-Atq", "-U", "postgres", "-d", "postgres",
    "-c", "SELECT system_identifier::text FROM pg_control_system()",
  ], { encoding: "utf8", timeout: 10000, windowsHide: true }).trim();
  if (system !== env.RATING_FEEDBACK_ATTESTED_SYSTEM_IDENTIFIER) {
    throw new Error("Issue463 SQL system identity mismatch.");
  }
  await assertMigrationTarget(root, env, true);
  return { database, system };
}
