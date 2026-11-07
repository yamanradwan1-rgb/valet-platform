import { setTimeout as delay } from "node:timers/promises";
import { performance } from "node:perf_hooks";

import type { PoolClient } from "pg";
import { afterAll,beforeAll,describe,expect,it } from "vitest";

import { openIssue309PhotoHttpFixture, type Issue309PhotoHttpFixture } from "./issue309-photo-http-fixture";
import { runPhotoFenceHttp,seedPhotoFenceCase,type PhotoFenceCase } from "./issue309-photo-cross-commit-pg17-fixture";
import { issue309IdleObservationBudgetMs } from "./issue309-photo-pg-activity";

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
  const started = performance.now();
  const budgetMs = issue309IdleObservationBudgetMs();
  const checkZeroIdle = async () => {
    const result = await h.db.admin.query<{
      pid: number;
      usename: string;
      application_name: string;
      xact_start: Date | null;
      state_change: Date | null;
    }>(
      `SELECT pid,usename,application_name,xact_start,state_change
       FROM pg_stat_activity
       WHERE datname=current_database() AND pid<>pg_backend_pid()
         AND state='idle in transaction'
       ORDER BY pid`,
    );
    // Whole database, including test writers: no SQL or bound value output.
    const attributed = result.rows.map((row) => ({
      ...row, owner: h.pgActivity.describe(row.pid), testWriter: row.pid === writerPid,
    }));
    expect(attributed, `Idle transaction(s): ${JSON.stringify(attributed)}`).toEqual([]);
    if (performance.now() - started >= budgetMs) {
      throw new Error("Issue309 zero-idle observation exceeded PostgreSQL watchdog budget.");
    }
  };
  // Observe before waiting: a lost Nest lease must be captured before PG kills it.
  await checkZeroIdle();
  const remaining = budgetMs - Math.ceil(performance.now() - started);
  if (remaining < 1) throw new Error("Nest observation budget expired.");
  await h.waitForNestPoolToSettle(remaining);
  await checkZeroIdle();
}

describe("Issue #309 two-connection real restricted PG17 + Node HTTP fence", () => {
  let h: Issue309PhotoHttpFixture;
  beforeAll(async () => { h = await openIssue309PhotoHttpFixture({ hypotheticalApprovedRoles:true }); },240_000);
  afterAll(async () => { await h?.close(); },90_000);

  it("detects an intentionally uncommitted fixture transaction by backend PID",async()=>{
    const writer = await h.db.admin.connect();
    try {
      const pid = (await writer.query<{pid:number}>(
        "SELECT pg_backend_pid() AS pid",
      )).rows[0]!.pid;
      await writer.query("BEGIN");
      await expect(ensureNoIdleTransaction(h,pid)).rejects.toThrow(
        /"owner":"fixture-admin:checkout-\d+:leased","testWriter":true/,
      );
    } finally {
      await writer.query("ROLLBACK");
      writer.release();
    }
    await ensureNoIdleTransaction(h);
  },90_000);

  it("detects a Nest runtime BEGIN before PostgreSQL can kill the backend",async()=>{
    const runtime = await h.nestPool.connect();
    try {
      const configured = await runtime.query<{pid: number; setting: string; unit: string}>(
        `SELECT pg_backend_pid() AS pid,setting,unit FROM pg_settings
         WHERE name='idle_in_transaction_session_timeout'`,
      );
      const row = configured.rows[0]!;
      const watchdogMs = Number(row.setting);
      expect(row.unit).toBe("ms");
      expect(watchdogMs).toBeGreaterThan(2 * issue309IdleObservationBudgetMs());
      await runtime.query("BEGIN");
      const started = performance.now();
      await expect(ensureNoIdleTransaction(h,row.pid)).rejects.toThrow(
        /"owner":"nest-http:checkout-\d+:leased","testWriter":true/,
      );
      expect(performance.now() - started).toBeLessThan(watchdogMs / 2);
      expect((await runtime.query<{pid:number}>("SELECT pg_backend_pid() AS pid")).rows[0]?.pid)
        .toBe(row.pid);
    } finally {
      try { await runtime.query("ROLLBACK"); }
      finally { runtime.release(); }
    }
    await ensureNoIdleTransaction(h);
  },90_000);

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
      let writerPid: number | undefined;
      let open = false;
      try {
        writerPid = (await writer.query<{ pid: number }>(
          "SELECT pg_backend_pid() AS pid",
        )).rows[0]?.pid;
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
