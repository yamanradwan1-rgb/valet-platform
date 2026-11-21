import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { test } from "node:test";
import {
  activationArgs,
  activationCall,
  createActivationFixture,
  denied,
  deniedOldTransactionProof,
  invitationFor,
  keyFor,
  pending,
  scope,
  transactionId,
} from "./s04-staff-activation-pg17-support.mjs";

const url = process.env.S04_W67_PG17_FIXTURE_URL;
const systemId = process.env.S04_W67_PG17_SYSTEM_ID;
const fixturePort = process.env.S04_W67_PG17_PORT;
const sql =
  "SELECT public.s04_staff_activation_success($1::uuid,$2,$3,$4,$5::xid8,$6::uuid,$7::bigint,$8) AS affected";

test(
  "owned PG17: XID-bound activation finalizer, rollback, replay, cross-row and ACL",
  {
    skip:
      !url || !systemId || !fixturePort
        ? "explicit individually attested PG17 required"
        : false,
  },
  async () => {
    const fixture = await createActivationFixture(url, systemId, fixturePort);
    const { admin, runtime, writer, mfa, close } = fixture;
    try {
      const invite = randomUUID();
      const membership = randomUUID();
      const organization = randomUUID();
      const user = randomUUID();
      const tokenHash = invitationFor("a");
      await admin.query("INSERT INTO public.users VALUES($1,'PENDING')", [
        user,
      ]);
      await admin.query(
        "INSERT INTO public.organization_memberships VALUES($1,$2,$3,'PENDING')",
        [membership, organization, user],
      );
      await admin.query(
        "INSERT INTO public.staff_onboarding_invitations VALUES($1,$2,$3,$4,NULL,NULL,1)",
        [invite, organization, membership, tokenHash],
      );

      const events = [
        {
          scope,
          key: keyFor("a"),
          id: await pending(runtime, scope, keyFor("a")),
        },
        {
          scope: "v1:staff-activation-client-address",
          key: keyFor("b"),
          id: await pending(
            runtime,
            "v1:staff-activation-client-address",
            keyFor("b"),
          ),
        },
        {
          scope: "v1:guest-token",
          key: keyFor("c"),
          id: await pending(runtime, "v1:guest-token", keyFor("c")),
        },
        {
          scope,
          key: keyFor("d"),
          id: await pending(runtime, scope, keyFor("d")),
        },
      ];
      await denied(runtime, events[0], tokenHash);
      await denied(mfa, events[0], tokenHash);
      await denied(writer, events[2], tokenHash);
      await denied(writer, events[0], invitationFor("f"));
      await denied(writer, events[0], tokenHash, { badMac: true });
      // Keep p_xid current while the HMAC commits to a different XID. This
      // exercises the signed-payload binding rather than only the SQL XID guard.
      await denied(writer, events[0], tokenHash, { wrongXidMac: true });
      await denied(writer, events[0], tokenHash, {
        mismatchedXidParameter: true,
      });
      await denied(writer, events[3], tokenHash, { proofFor: events[0] });
      await denied(writer, events[0], tokenHash);

      const writeEvidence = async () => {
        await admin.query(
          "UPDATE public.users SET status='ACTIVE' WHERE id=$1",
          [user],
        );
        await admin.query(
          "UPDATE public.organization_memberships SET status='ACTIVE' WHERE id=$1",
          [membership],
        );
        await admin.query(
          "UPDATE public.staff_onboarding_invitations SET consumed_at=clock_timestamp() WHERE id=$1",
          [invite],
        );
        await admin.query(
          `INSERT INTO public.audit_events VALUES($1,'OrganizationMembership',$2,
             'STAFF_ONBOARDING_ACTIVATED',$3::jsonb)`,
          [
            organization,
            membership,
            JSON.stringify({ invitationId: invite, generation: 1 }),
          ],
        );
      };

      await admin.query("BEGIN");
      const rollbackXid = await transactionId(admin);
      await writeEvidence();
      await admin.query("SET LOCAL ROLE w67_s04_staff_writer");
      const rollbackProofs = events
        .slice(0, 2)
        .map((row) => activationArgs(row, tokenHash, rollbackXid));
      for (const args of rollbackProofs) {
        assert.equal((await admin.query(sql, args)).rows[0].affected, 1);
      }
      await admin.query("ROLLBACK");

      const afterRollback = await runtime.query(
        "SELECT id,state FROM public.anti_abuse_events WHERE id=ANY($1::uuid[])",
        [events.map((event) => event.id)],
      );
      const rollbackStates = new Map(
        afterRollback.rows.map((row) => [row.id, row.state]),
      );
      assert.deepEqual(
        events.map((event) => rollbackStates.get(event.id)),
        ["PENDING", "PENDING", "PENDING", "PENDING"],
      );
      const rolledBackEvidence = await admin.query(
        `SELECT account.status AS account_status,member.status AS member_status,
                invitation.consumed_at
         FROM public.staff_onboarding_invitations invitation
         JOIN public.organization_memberships member ON member.id=invitation.membership_id
         JOIN public.users account ON account.id=member.user_id
         WHERE invitation.id=$1`,
        [invite],
      );
      assert.deepEqual(rolledBackEvidence.rows[0], {
        account_status: "PENDING",
        member_status: "PENDING",
        consumed_at: null,
      });
      await deniedOldTransactionProof(writer, rollbackProofs[0]);

      await admin.query("BEGIN");
      const commitXid = await transactionId(admin);
      await writeEvidence();
      await admin.query("SET LOCAL ROLE w67_s04_staff_writer");
      const commitProofs = events
        .slice(0, 2)
        .map((row) => activationArgs(row, tokenHash, commitXid));
      for (const args of commitProofs) {
        assert.equal((await admin.query(sql, args)).rows[0].affected, 1);
      }
      await admin.query("SAVEPOINT activation_nonce_replay");
      await assert.rejects(
        admin.query(sql, commitProofs[0]),
        (error) => error.code === "42501",
      );
      await admin.query("ROLLBACK TO SAVEPOINT activation_nonce_replay");
      await admin.query("COMMIT");

      const afterCommit = await runtime.query(
        "SELECT id,state FROM public.anti_abuse_events WHERE id=ANY($1::uuid[])",
        [events.map((event) => event.id)],
      );
      const committedStates = new Map(
        afterCommit.rows.map((row) => [row.id, row.state]),
      );
      assert.deepEqual(
        events.map((event) => committedStates.get(event.id)),
        ["IGNORED", "IGNORED", "PENDING", "PENDING"],
      );

      const countedId = randomUUID();
      await admin.query(
        `INSERT INTO public.anti_abuse_events(id,scope,key_hash,state)
         VALUES($1,$2,$3,'COUNTED')`,
        [countedId, scope, events[0].key],
      );
      assert.equal(
        (
          await activationCall(
            writer,
            { id: countedId, scope, key: events[0].key },
            tokenHash,
          )
        ).rows[0].affected,
        0,
      );
      assert.equal(
        (
          await activationCall(
            writer,
            { id: events[0].id, scope, key: keyFor("f") },
            tokenHash,
          )
        ).rows[0].affected,
        0,
      );
      await assert.rejects(
        writer.query(
          "UPDATE public.anti_abuse_events SET state='IGNORED' WHERE id=$1",
          [countedId],
        ),
        (error) => error.code === "42501",
      );
    } finally {
      await close();
    }
  },
);
