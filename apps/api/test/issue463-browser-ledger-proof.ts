import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect } from "vitest";
import { fixture } from "./rating-disposition-ledger-fixture.mjs";
import { seedIssue463Browser } from "./issue463-browser-seed";
import type { acquireIssue463BrowserTarget } from "./issue463-browser-target";
import {
  appendDispositionIntent, appendDispositionReceipt, applyAfterDurableIntent,
} from "../src/modules/guest-access/rating-disposition-ledger-protocol";
import { prepareQuarantinedRestore, replayInQuarantine } from "../src/modules/guest-access/rating-disposition-ledger-restore";
import { snapshotQuarantinedIssue463Restore } from "./issue463-browser-restore-pg";
import { DispositionLedgerBlocked } from "../src/modules/guest-access/rating-disposition-ledger-types";
import { createDispositionSqlAdapter } from "../src/modules/guest-access/rating-disposition-sql-adapter";
import type { DispositionReceiptMetadata } from "../src/modules/guest-access/rating-disposition-sql-adapter";

type Target = Awaited<ReturnType<typeof acquireIssue463BrowserTarget>>;
interface DbReceipt {
  approval_id: string; organization_id: string; location_id: string;
  visit_id: string; case_id: string; action: string;
  approved_by: string; approved_at: Date; valid_until: Date;
  completed_at: Date | null; executed_by: string | null; outcome: string | null;
}

/** Synthetic ledger + actual E-only committed SQL, exact scoped M test witness.
 * No production inspector credentials or provider qualification. */
export async function verifyIssue463LedgerSql(target: Target, apiOrigin: string) {
  const org = await seedIssue463Browser(target);
  const visit = await org.completedVisit();
  const approval = randomUUID();
  const caseId = randomUUID();
  const commandId = randomUUID();
  const text = "Synthetic ledger integration sentinel.";
  const write = await fetch(apiOrigin + "/v1/guest/session/rating", {
    method: "POST", headers: { authorization: "Bearer " + visit.token, "content-type": "application/json" },
    body: JSON.stringify({ rating: 5, expectedValetSessionId: visit.id, comment: text }),
    signal: AbortSignal.timeout(10_000),
  });
  console.info("P7_LEDGER_HTTP_STATUS " + write.status);
  expect(write.status).toBe(200);
  console.info("P7_MILESTONE LEDGER_RATED");
  const a = new Client({ connectionString: target.approverUrl, connectionTimeoutMillis: 5000 });
  const e = new Client({ connectionString: target.executorUrl, connectionTimeoutMillis: 5000 });
  let restored: Awaited<ReturnType<typeof snapshotQuarantinedIssue463Restore>> | undefined;
  try {
    await a.connect(); await e.connect();
    const approved = await a.query<{ outcome: string }>(
      "SELECT public.approve_guest_rating_comment_disposition($1,$2,$3,$4,'ERASE',$5,date_trunc('milliseconds',clock_timestamp()+interval '10 minutes')) AS outcome",
      [approval, org.organizationId, org.locationId, visit.id, caseId],
    );
    expect(approved.rows).toEqual([{ outcome: "APPROVED" }]);
    console.info("P7_MILESTONE LEDGER_APPROVED");
    const scope = { approvalId: approval, caseId, commandId, organizationId: org.organizationId,
      locationId: org.locationId, visitId: visit.id, action: "ERASE" as const };
    async function inspect(id: string): Promise<DispositionReceiptMetadata | null> {
      if (id !== approval) return null;
      const rows = await target.client.query<DbReceipt>(`SELECT approval_id,organization_id,location_id,
        visit_id,case_id,action,approved_by,approved_at,valid_until,completed_at,executed_by,outcome
        FROM guest_rating_comment_privacy_commands WHERE approval_id=$1 AND organization_id=$2
        AND location_id=$3 AND visit_id=$4 AND case_id=$5`,
        [id, org.organizationId, org.locationId, visit.id, caseId]);
      const row = rows.rows[0];
      if (rows.rows.length !== 1 || !row || row.action !== "ERASE" ||
          (row.outcome !== null && row.outcome !== "ERASED")) return null;
      return { ...scope, approvedBy: row.approved_by, approvedAt: row.approved_at.toISOString(),
        validUntil: row.valid_until.toISOString(), completedAt: row.completed_at?.toISOString() ?? null,
        executedBy: row.executed_by, outcome: row.outcome };
    }
    const pending = await inspect(approval);
    if (!pending || pending.outcome !== null || pending.completedAt !== null) throw Error("Issue463 expected pending SQL case.");
    console.info("P7_MILESTONE LEDGER_PENDING");
    const { store, crypt, anchor } = await fixture();
    console.info("P7_MILESTONE LEDGER_FIXTURE_READY");
    let calls = 0;
    const adapter = createDispositionSqlAdapter({
      async executeCommitted(sql, parameters) {
        calls += 1;
        // The real SQL statement autocommits. Inject loss only AFTER its response.
        const response = await e.query<{ outcome: unknown }>(sql, [...parameters]);
        expect(response.rows).toEqual([{ outcome: "ERASED" }]);
        throw Error("Synthetic lost executor acknowledgement");
      },
    }, { readExactApproval: inspect });
    // The disposable proof records observed database time for its synthetic
    // ledger, avoiding host/VM clock skew in a timestamp-ordering fixture.
    const observedTime = async () => {
      const rows = await target.client.query<{ at: Date }>(
        "SELECT date_trunc('milliseconds',clock_timestamp()) AS at");
      if (!rows.rows[0]) throw Error("Issue463 observed clock unavailable.");
      return rows.rows[0].at.toISOString();
    };
    const input = { ...scope, eventId: randomUUID(), approvedBy: pending.approvedBy,
      approvedAt: pending.approvedAt, validUntil: pending.validUntil, recordedAt: await observedTime() };
    store.failure = "UNKNOWN_BEFORE";
    await expect(appendDispositionIntent(store, crypt, anchor, input)).rejects.toMatchObject({ reason: "UNKNOWN_APPEND" });
    console.info("P7_MILESTONE LEDGER_UNKNOWN_BLOCKED");
    expect(calls).toBe(0);
    expect((await inspect(approval))?.completedAt).toBeNull();
    store.failure = null;
    const proof = await appendDispositionIntent(store, crypt, anchor, input);
    console.info("P7_MILESTONE LEDGER_INTENT");
    restored = await snapshotQuarantinedIssue463Restore(target, scope, text);
    console.info("P7_MILESTONE RESTORE_SNAPSHOT");
    expect(await applyAfterDurableIntent(store, crypt, anchor, proof, adapter)).toBe("UNKNOWN");
    expect(calls).toBe(1);
    console.info("P7_MILESTONE LEDGER_APPLY");
    await expect(prepareQuarantinedRestore(store, crypt, anchor)).rejects.toMatchObject({ reason: "UNRESOLVED_INTENT" });
    await expect(replayInQuarantine(store, crypt, anchor, restored.replayTarget))
      .rejects.toMatchObject({ reason: "UNRESOLVED_INTENT" });
    expect((await restored.state()).state).toBe("PRESENT");
    expect(await applyAfterDurableIntent(store, crypt, anchor, proof, adapter)).toBe("COMMITTED");
    expect(calls).toBe(1);
    console.info("P7_MILESTONE LEDGER_APPLY");
    const committed = await inspect(approval);
    if (committed?.outcome !== "ERASED" || !committed.completedAt || !committed.executedBy)
      throw Error("Issue463 exact committed SQL receipt missing.");
    await appendDispositionReceipt(store, crypt, anchor, { ...scope, eventId: randomUUID(),
      intentEventId: input.eventId, executorId: committed.executedBy, executedAt: committed.completedAt,
      outcome: "ERASED", recordedAt: await observedTime() }, adapter);
    console.info("P7_MILESTONE LEDGER_RECEIPT");
    const plan = await prepareQuarantinedRestore(store, crypt, anchor);
    expect(plan.admission).toBe("DENY");
    expect(plan.terminalErases).toEqual([{ approvalId: approval, caseId,
      organizationId: org.organizationId, locationId: org.locationId, visitId: visit.id }]);
    const erased = await target.client.query(`SELECT r.rating,c.state,c.comment_text,c.erased_at IS NOT NULL AS erased
      FROM guest_ratings r JOIN guest_rating_comments c USING(organization_id,location_id,valet_session_id)
      WHERE r.organization_id=$1 AND r.location_id=$2 AND r.valet_session_id=$3`,
      [org.organizationId, org.locationId, visit.id]);
    expect(erased.rows).toEqual([{ rating: 5, state: "ERASED", comment_text: null, erased: true }]);
    expect(JSON.stringify(store.events)).not.toContain(text);
    store.failure = "HEAD_UNAVAILABLE";
    await expect(replayInQuarantine(store, crypt, anchor, restored.replayTarget)).rejects.toThrow();
    expect((await restored.state()).state).toBe("PRESENT");
    store.failure = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(await replayInQuarantine(store, crypt, anchor, restored.replayTarget))
        .toEqual({replayVerified:true,admission:"DENY"});
      expect(await restored.state()).toEqual({rating:5,state:"ERASED",comment_text:null,outcome:"ERASED",case_id:caseId});
    }
    console.info("P7_MILESTONE RESTORE_VERIFIED");
  } catch (error) {
    if (error instanceof DispositionLedgerBlocked)
      console.info("P7_LEDGER_REASON " + error.reason);
    else console.info("P7_LEDGER_REASON NON_LEDGER_FAILURE");
    throw error;
  } finally {
    await restored?.close();
    await Promise.allSettled([a.end(), e.end()]);
  }
}
