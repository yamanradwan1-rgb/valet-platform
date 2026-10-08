import { AntiAbuseKeyDeriver } from "../src/modules/anti-abuse/anti-abuse-key";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  GuestBrowserSessionTestContext,
  mutationHeaders,
} from "./guest-browser-session-test-context";
import { startGuestBrowserPeerApp } from "./guest-browser-session-peer-app";

describe("Guest Browser Session T3 enrollment resource bound", () => {
  const context = new GuestBrowserSessionTestContext("enrollment_bound");
  let peer: Awaited<ReturnType<typeof startGuestBrowserPeerApp>>;

  beforeAll(async () => {
    await context.setup();
    peer = await startGuestBrowserPeerApp(context.runtimePool);
  }, 120_000);

  afterAll(async () => {
    await peer?.app.close();
    await context.teardown();
  }, 60_000);

  async function enrollAtPeer() {
    const response = await fetch(
      `${peer.baseUrl}/v1/guest/browser-session/enroll`,
      {
        method: "POST",
        headers: mutationHeaders,
        body: "{}",
      },
    );
    return response;
  }

  it("bounds successful anonymous allocations across API instances", async () => {
    await context.adminPool.query("DELETE FROM anti_abuse_events");
    const before = await context.adminPool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM guest_browser_enrollments",
    );

    const key = new AntiAbuseKeyDeriver().derive(
      "v1:guest-enrollment-address",
      "127.0.0.1",
    );
    await context.adminPool.query(
      "INSERT INTO anti_abuse_events(scope,key_hash,state) SELECT $1,$2,'COUNTED' FROM generate_series(1,3998)",
      [key.scope, key.keyHash],
    );
    for (let attempt = 0; attempt < 1; attempt += 1) {
      const result = await context.request(
        "POST",
        "/v1/guest/browser-session/enroll",
        { body: {}, headers: mutationHeaders },
      );
      expect(result.status).toBe(204);
    }

    const [local, remote] = await Promise.all([
      context.request("POST", "/v1/guest/browser-session/enroll", {
        body: {},
        headers: mutationHeaders,
      }),
      enrollAtPeer(),
    ]);
    const statuses = [local.status, remote.status].sort((a, b) => a - b);
    expect(statuses).toEqual([204, 429]);

    const after = await context.adminPool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM guest_browser_enrollments",
    );
    expect(after.rows[0]!.count - before.rows[0]!.count).toBe(2);

    const limiter = await context.adminPool.query<{
      counted: number;
      pending: number;
    }>(
      `SELECT count(*) FILTER (WHERE state='COUNTED')::int AS counted,
              count(*) FILTER (WHERE state='PENDING')::int AS pending
       FROM anti_abuse_events
       WHERE scope='v1:guest-enrollment-address'`,
    );
    expect(limiter.rows[0]).toEqual({ counted: 4000, pending: 0 });

    const limited = local.status === 429 ? local : remote;
    expect(limited.headers.get("retry-after")).toMatch(/^\d+$/);
    expect(limited.headers.get("cache-control")).toBe("no-store");
    expect(limited.headers.get("set-cookie")).toBeNull();

    await context.adminPool.query(
      `UPDATE anti_abuse_events
       SET occurred_at=clock_timestamp()-interval '16 minutes'
       WHERE scope='v1:guest-enrollment-address'`,
    );
    expect((await enrollAtPeer()).status).toBe(204);
  });
});
