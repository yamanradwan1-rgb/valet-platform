import { spawnSync } from "node:child_process";
import process from "node:process";

const fixtureUrl = process.env.S04_W67_PG17_FIXTURE_URL;
const superuserUrl = process.env.S04_W67_PG17_SUPERUSER_URL;
const systemId = process.env.S04_W67_PG17_SYSTEM_ID;
if (!fixtureUrl || !superuserUrl || !/^\d{10,25}$/.test(systemId ?? "")) {
  throw new Error(
    "S04 PG17 requires its non-superuser fixture URL, loopback-only bootstrap URL, and independently observed system identifier.",
  );
}

const fixture = new URL(fixtureUrl);
const bootstrap = new URL(superuserUrl);
if (fixture.protocol !== "postgresql:" || fixture.hostname !== "127.0.0.1" ||
    fixture.port !== "51667" || fixture.pathname !== "/s04_w67_disposable" ||
    fixture.username !== "w67_owner" || fixture.search !== "" || fixture.hash !== "" ||
    bootstrap.protocol !== fixture.protocol || bootstrap.hostname !== fixture.hostname ||
    bootstrap.port !== fixture.port || bootstrap.pathname !== fixture.pathname ||
    bootstrap.username !== "postgres" || bootstrap.search !== "" || bootstrap.hash !== "") {
  throw new Error("S04 PG17 URLs must identify the exact loopback disposable target.");
}

const result = spawnSync(process.execPath, [
  "--test",
  "--test-concurrency=1",
  "issue416-s04/s04-pg17-protected.integration.mjs",
  "issue416-s04/s04-staff-activation-pg17.integration.mjs",
], { stdio: "inherit", env: process.env });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
