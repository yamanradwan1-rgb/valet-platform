import { setTimeout as delay } from "node:timers/promises";

import type { PoolClient } from "pg";
import { afterAll,beforeAll,describe,expect,it } from "vitest";

import { openIssue309PhotoHttpFixture, type Issue309PhotoHttpFixture } from "./issue309-photo-http-fixture";
import { runPhotoFenceHttp,seedPhotoFenceCase,type PhotoFenceCase } from "./issue309-photo-cross-commit-pg17-fixture";

type Revoker = "session" | "grant" | "availability";

async function revoke(writer: PoolClient, item: PhotoFenceCase, kind: Revoker) {
  if (kind === "session") await writer.query(
    "UPDATE staff_auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1",
    [item.credential.staffAuthSessionId],
  );
  else if (kind === "grant") await writer.query(
    `DELETE FROM membership_location_access
     WHERE organization_id=$1 AND membership_id=$2 AND location_id=$3`,
    [item.orgId,item.memberId,item.locationId],
  );
  else await writer.query(
    "SELECT public.condition_photo_maintenance_mark_unavailable($1::uuid,'CONTENT_MISMATCH')",
    [item.photoId],
  );
}

async function ensureNoIdleTransaction(h: Issue309PhotoHttpFixture, writerPid?: number) {
  const result = await h.db.admin.query<{
    pid: number;
    usename: string;
    application_name: string;
    xact_start: Date | null;
    state_change: Date | null;
    query: string;
  }>(
    `SELECT pid,usename,application_name,xact_start,state_change,
            left(query,160) AS query
     FROM pg_stat_activity
     WHERE datname=current_database() AND pid<>pg_backend_pid()
       AND state='idle in transaction'
     ORDER BY pid`,
  );
  // Keep the zero-idle invariant; surface backend identity to distinguish a
  // pending test writer from an unreleased photo witness or app pool lease.
  expect(result.rows, `Idle transaction(s); test writer PID=${writerPid ?? "none"}: ${JSON.stringify(result.rows)}`)
    .toEqual([]);
}

describe("Issue #309 two-connection real restricted PG17 + Node HTTP fence", () => {
  let h: Issue309PhotoHttpFixture;
  beforeAll(async () => { h = await openIssue309PhotoHttpFixture({ hypotheticalApprovedRoles:true }); },240_000);
  afterAll(async () => { await h?.close(); },90_000);

  it("COMMIT completed at PostgreSQL but its ACK was lost: never sends JPEG", async () => {
    const item = await seedPhotoFenceCase(h);
    const result = await runPhotoFenceHttp(h,item,{commitAckLost:true});
    expect(result.status).toBe(503);
    expect(result.body.includes(item.jpeg)).toBe(false);
    expect(result.order).toEqual(["witness-locked"]);
    expect(result.calls).toBe(2);
    await ensureNoIdleTransaction(h);
  },90_000);

  it("lost witness liveness after successful COMMIT denies JPEG",async()=>{
    const item = await seedPhotoFenceCase(h);
    const result = await runPhotoFenceHttp(h,item,{witnessLivenessLost:true});
    expect(result.status).toBe(503);
    expect(result.order).toEqual(["witness-locked"]);
    await ensureNoIdleTransaction(h);
  },90_000);

  for(const kind of ["session","grant","availability"] as const){
    it(`revoker-first ${kind} transaction wins and denies real JPEG`,async()=>{
      const item = await seedPhotoFenceCase(h);
      const writer = await h.db.admin.connect();
      const writerPid = (await writer.query<{ pid: number }>(
        "SELECT pg_backend_pid() AS pid",
      )).rows[0]!.pid;
      let open = false;
      try {
        await writer.query("BEGIN"); open=true;
        await revoke(writer,item,kind);
        const pending = runPhotoFenceHttp(h,item);
        // The witness must wait for the canonical writer to commit before it
        // can validate the now-ineligible row on its fresh READ COMMITTED view.
        await delay(100);
        await writer.query("COMMIT"); open=false;
        const result = await pending;
        expect(result.status).toBe(503);
        expect(result.order).not.toContain("jpeg-enqueued");
        await ensureNoIdleTransaction(h, writerPid);
      } finally {
        if(open) await writer.query("ROLLBACK");
        writer.release();
      }
    },90_000);

    it(`reader-first ${kind} revocation waits until actual JPEG enqueue`,async()=>{
      const item = await seedPhotoFenceCase(h);
      const writer = await h.db.admin.connect();
      let pending: Promise<void> | undefined;
      let completed = false;
      try {
        const reply = await runPhotoFenceHttp(h,item,{
          onWitnessLocked:async()=>{
            pending = revoke(writer,item,kind).then(()=>{completed=true;});
            await delay(120);
            expect(completed).toBe(false);
          },
        });
        expect(reply.status).toBe(200);
        expect(reply.body).toEqual(item.jpeg);
        expect(reply.order).toEqual(["witness-locked","jpeg-enqueued"]);
        await pending;
        expect(completed).toBe(true);
        await ensureNoIdleTransaction(h);
      } finally {
        if(pending) await pending.catch(()=>undefined);
        writer.release();
      }
    },90_000);
  }

  it("writer queued after witness blocks A until 300ms timeout, then no JPEG",async()=>{
    const item = await seedPhotoFenceCase(h);
    const writer = await h.db.admin.connect();
    let pending: Promise<void> | undefined;
    let begun = false;
    try {
      const result = await runPhotoFenceHttp(h,item,{
        onWitnessLocked:async()=>{
          await writer.query("BEGIN");
          begun = true;
          pending = writer.query(
            `SELECT pg_advisory_xact_lock(
               hashtextextended('staff-management-org:' || $1::text,0))`,
            [item.orgId],
          ).then(async()=>{
            await revoke(writer,item,"grant");
            await writer.query("COMMIT");
            begun = false;
          });
          await delay(120);
          const waiting = await h.db.admin.query<{ blocked:number }>(
            `SELECT COUNT(*)::int AS blocked FROM pg_stat_activity
             WHERE datname=current_database() AND pid<>pg_backend_pid()
               AND wait_event_type='Lock' AND wait_event='advisory'`,
          );
          expect(waiting.rows[0]?.blocked).toBeGreaterThanOrEqual(1);
        },
      });
      expect(result.status).toBe(503);
      expect(result.order).toEqual(["witness-locked"]);
      await pending;
      await ensureNoIdleTransaction(h);
    } finally {
      if(pending) await pending.catch(()=>undefined);
      if(begun) await writer.query("ROLLBACK");
      writer.release();
    }
  },90_000);

  it("two full checks finish on distinct leases with no held locks after HTTP",async()=>{
    const item = await seedPhotoFenceCase(h);
    const result = await runPhotoFenceHttp(h,item);
    expect(result.status).toBe(200);
    expect(result.body).toEqual(item.jpeg);
    expect(result.calls).toBe(2);
    await ensureNoIdleTransaction(h);
  },90_000);
});
