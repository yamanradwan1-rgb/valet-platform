import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  createS04Fixture,
  expectDenied,
  keyFor,
  scope,
  s04FixtureAvailable,
  sign,
} from "./s04-pg17-protected-fixture.mjs";

test(
  "S04 independent PG17 fixture denies raw runtime SQL and accepts bounded proofs",
  {
    skip: s04FixtureAvailable
      ? false
      : "explicit unique disposable PG17 fixture and bootstrap identity required",
  },
  async () => {
    const fixture = await createS04Fixture();
    const { admin, runtime, staff, mfa, close } = fixture;
    try {
      await expectDenied(
        runtime,
        "INSERT INTO public.anti_abuse_events(scope,key_hash,state) VALUES($1,$2,'COUNTED')",
        [scope, keyFor("a")],
      );
      await expectDenied(
        runtime,
        "UPDATE public.anti_abuse_events SET state='IGNORED' WHERE scope=$1",
        [scope],
      );
      await expectDenied(
        runtime,
        "UPDATE public.anti_abuse_events SET group_key_hash=$1 WHERE scope=$2",
        [keyFor("c"), scope],
      );
      await expectDenied(runtime, "SELECT * FROM s04_quota_guard.proof_key");
      await expectDenied(
        runtime,
        "SELECT public.s04_staff_login_success($1::uuid,$2)",
        [randomUUID(), keyFor("a")],
      );
      const unsigned = [randomUUID(), Date.now() + 15000, "0".repeat(64)];
      await expectDenied(
        runtime,
        "SELECT public.s04_counted($1,$2,$3::uuid,$4::bigint,$5)",
        [scope, keyFor("a"), ...unsigned],
      );
      const counted = sign("COUNTED", [scope, keyFor("a")]);
      await runtime.query(
        "SELECT public.s04_counted($1,$2,$3::uuid,$4::bigint,$5)",
        [scope, keyFor("a"), ...counted],
      );
      await expectDenied(
        runtime,
        "SELECT public.s04_counted($1,$2,$3::uuid,$4::bigint,$5)",
        [scope, keyFor("a"), ...counted],
      );
      const countRow = await runtime.query(
        "SELECT count(*)::integer AS count FROM public.anti_abuse_events WHERE key_hash=$1",
        [keyFor("a")],
      );
      assert.equal(countRow.rows[0].count, 1);

      const pendingKey = keyFor("b");
      const pending = sign("PENDING", ["v1:mfa-totp-user", pendingKey]);
      const reserved = await runtime.query(
        "SELECT public.s04_reserve($1,$2,$3::uuid,$4::bigint,$5) AS id",
        ["v1:mfa-totp-user", pendingKey, ...pending],
      );
      const reservationId = reserved.rows[0].id;
      const illegitimate = sign("FINALIZE", [
        reservationId,
        "v1:mfa-totp-user",
        pendingKey,
        "IGNORED",
      ]);
      await expectDenied(
        runtime,
        "SELECT public.s04_finalize($1::uuid,$2,$3,$4,$5::uuid,$6::bigint,$7)",
        [
          reservationId,
          "v1:mfa-totp-user",
          keyFor("f"),
          "IGNORED",
          ...illegitimate,
        ],
      );
      const mfaSettled = await mfa.query(
        "SELECT public.s04_mfa_success($1::uuid,$2,$3) AS updated",
        [reservationId, "v1:mfa-totp-user", pendingKey],
      );
      assert.equal(mfaSettled.rows[0].updated, 1);
      const settled = await runtime.query(
        "SELECT state FROM public.anti_abuse_events WHERE id=$1",
        [reservationId],
      );
      assert.equal(settled.rows[0].state, "IGNORED");

      const gKey = keyFor("d");
      const gGroup = keyFor("e");
      await admin.query(
        `INSERT INTO public.anti_abuse_events(scope,key_hash,state,request_class,group_key_hash)
         VALUES('v1:guest-token',$1,'COUNTED',NULL,NULL)`,
        [gKey],
      );
      const classValues = [gKey, gGroup, "C", 2, 3, 3, 123, 456, 789, 111];
      const first = await runtime.query(
        `SELECT id,retry_after FROM public.s04_guest_classified(
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::uuid,$12::bigint,$13)`,
        [...classValues, ...sign("GUEST", classValues)],
      );
      assert.ok(first.rows[0].id);
      assert.equal(first.rows[0].retry_after, 0);
      const rebound = await runtime.query(
        `SELECT count(*)::integer AS count FROM public.anti_abuse_events
         WHERE key_hash=$1 AND group_key_hash=$2 AND request_class IS NULL`,
        [gKey, gGroup],
      );
      assert.equal(rebound.rows[0].count, 1);
      const second = await runtime.query(
        `SELECT id,retry_after FROM public.s04_guest_classified(
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::uuid,$12::bigint,$13)`,
        [...classValues, ...sign("GUEST", classValues)],
      );
      assert.equal(second.rows[0].id, null);
      assert.ok(second.rows[0].retry_after >= 1);
      const changed = [...classValues];
      changed[1] = keyFor("f");
      await expectDenied(
        runtime,
        `SELECT id,retry_after FROM public.s04_guest_classified(
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::uuid,$12::bigint,$13)`,
        [...changed, ...sign("GUEST", classValues)],
      );

      const staffKey = keyFor("9");
      const staffPending = sign("PENDING", [
        "v1:staff-login-identifier",
        staffKey,
      ]);
      const staffId = await runtime.query(
        "SELECT public.s04_reserve($1,$2,$3::uuid,$4::bigint,$5) AS id",
        ["v1:staff-login-identifier", staffKey, ...staffPending],
      );
      const staffResult = await staff.query(
        "SELECT public.s04_staff_login_success($1::uuid,$2) AS updated",
        [staffId.rows[0].id, staffKey],
      );
      assert.equal(staffResult.rows[0].updated, 1);
    } finally {
      await close();
    }
  },
);
