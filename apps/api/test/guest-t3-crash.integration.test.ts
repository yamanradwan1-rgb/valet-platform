import { fork, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { once } from "node:events";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GuestBrowserSessionTestContext } from "./guest-browser-session-test-context";

describe("T3 real Nest process death after durable reservation", () => {
  const context = new GuestBrowserSessionTestContext("t3_process_crash");
  let child: ChildProcess | undefined;
  beforeAll(() => context.setup(), 120_000);
  afterAll(async () => {
    child?.kill("SIGKILL");
    await context.teardown();
  }, 60_000);

  it("retains PENDING conservatively, isolates authorized NAT traffic and recovers on DB time", async () => {
    const visit = await context.createVisit();
    child = fork(resolve(process.cwd(), "test/guest-t3-crash-worker.ts"), [], {
      execArgv: ["--import", "tsx"],
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: context.runtimeUrl,
        T3_OWNED_DATABASE: context.databaseName,
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    // Capture no secret-bearing stderr/connection information in evidence.
    const ready = await Promise.race([
      once(child, "message"),
      once(child, "exit").then(() => {
        throw new Error("Crash worker startup failed.");
      }),
    ]);
    const message = ready[0] as { url?: string; failed?: boolean };
    expect(message.failed).not.toBe(true);
    expect(message.url).toMatch(/^http:\/\/127\.0\.0\.1:/);
    const reserved = once(child, "message");
    const request = fetch(`${message.url}/reserve`).catch(() => undefined);
    expect((await reserved)[0]).toEqual({ reserved: true });
    const exited = once(child, "exit");
    child.kill("SIGKILL");
    await exited;
    await request;
    const rows = await context.adminPool.query(
      "SELECT count(*)::int AS count, min(state) AS state FROM anti_abuse_events WHERE scope='v1:guest-client-address'",
    );
    expect(rows.rows[0]).toEqual({ count: 1, state: "PENDING" });
    await context.adminPool.query(
      "INSERT INTO anti_abuse_events(scope,key_hash,state) SELECT scope,key_hash,'PENDING' FROM anti_abuse_events CROSS JOIN generate_series(1,59) WHERE scope='v1:guest-client-address'",
    );
    expect(
      (
        await context.request("GET", "/v1/guest/session", {
          authorization: `Bearer ${visit.token}`,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await context.request("GET", "/v1/guest/session", {
          authorization: `Bearer ${"x".repeat(43)}`,
        })
      ).status,
    ).toBe(429);
    await context.adminPool.query(
      "UPDATE anti_abuse_events SET occurred_at=clock_timestamp()-interval '901 seconds' WHERE scope='v1:guest-client-address'",
    );
    expect(
      (
        await context.request("GET", "/v1/guest/session", {
          authorization: `Bearer ${"x".repeat(43)}`,
        })
      ).status,
    ).toBe(401);
  }, 30_000);
});
