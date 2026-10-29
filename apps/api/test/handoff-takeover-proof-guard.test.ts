import type { PostgresTransaction } from "../src/common/database/postgres";
import { describe, expect, it, vi } from "vitest";

import {
  assertPostTakeoverRetrievalCustodyEvidence,
  consumeUnconsumedHandoffProofsForTakeover,
} from "../src/modules/retrieval/handoff-takeover-proof-guard";
import { lockReleaseEligibleHandoffVerification } from "../src/modules/retrieval/handoff-release-guard";

const conflict = () => {
  throw new Error("custody-integrity-conflict");
};
const t = new Date("2026-10-29T15:00:00.000Z");
const scope = {
  organizationId: "org",
  locationId: "loc",
  sessionId: "session",
  taskId: "task",
  keySlotId: "slot",
  currentAssigneeMembershipId: "B",
};
function tx(query: ReturnType<typeof vi.fn>) {
  return { query } as unknown as PostgresTransaction;
}

describe("handoff takeover proof lifecycle", () => {
  it("retires every unconsumed pending proof without altering verified history", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "old-A" }, { id: "old-B" }] })
      .mockResolvedValueOnce({
        rows: [{ id: "old-A" }, { id: "old-B" }],
        rowCount: 2,
      });
    const consumed = await consumeUnconsumedHandoffProofsForTakeover(
      tx(query),
      {
        organizationId: "org",
        sessionId: "session",
        sessionState: "HANDOFF_PENDING",
        operationTime: t,
      },
      conflict,
    );
    expect(consumed).toEqual(["old-A", "old-B"]);
    expect(query.mock.calls[1]![0]).toContain("SET consumed_at = $3");
    expect(query.mock.calls[1]![0]).not.toContain("verified_at =");
  });

  it("refuses surprising unconsumed proof in READY", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ id: "unexpected" }],
    });
    await expect(
      consumeUnconsumedHandoffProofsForTakeover(
        tx(query),
        {
          organizationId: "org",
          sessionId: "session",
          sessionState: "READY",
          operationTime: t,
        },
        conflict,
      ),
    ).rejects.toThrow("custody-integrity-conflict");
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("leaves non-takeover retrieval custody rules unchanged", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await assertPostTakeoverRetrievalCustodyEvidence(
      tx(query),
      scope,
      conflict,
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("rejects A checkout after latest owner change to B", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ birth_xid: "100" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            actor_membership_id: "A",
            after_epoch: true,
            event_type: "CHECKED_OUT",
            key_slot_id: "slot",
            occurred_at: new Date(t.getTime() + 1000),
          },
        ],
      });
    await expect(
      assertPostTakeoverRetrievalCustodyEvidence(tx(query), scope, conflict),
    ).rejects.toThrow("custody-integrity-conflict");
  });

  it("requires owner B checkout from a newer transaction than takeover", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ birth_xid: "100" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            actor_membership_id: "B",
            after_epoch: false,
            event_type: "CHECKED_OUT",
            key_slot_id: "slot",
            occurred_at: t,
          },
        ],
      });
    await expect(
      assertPostTakeoverRetrievalCustodyEvidence(tx(query), scope, conflict),
    ).rejects.toThrow("custody-integrity-conflict");
  });

  it("does not revive A's original checkout after A→B→A ownership ABA", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ birth_xid: "100" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            actor_membership_id: "A",
            after_epoch: false,
            event_type: "CHECKED_OUT",
            key_slot_id: "slot",
            occurred_at: new Date(t.getTime() - 50),
          },
        ],
      });
    await expect(
      assertPostTakeoverRetrievalCustodyEvidence(
        tx(query),
        { ...scope, currentAssigneeMembershipId: "A" },
        conflict,
      ),
    ).rejects.toThrow("custody-integrity-conflict");
  });

  it("accepts a later matching B checkout and rejects returned custody", async () => {
    const accepted = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ birth_xid: "100" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            actor_membership_id: "B",
            after_epoch: true,
            event_type: "CHECKED_OUT",
            key_slot_id: "slot",
            occurred_at: new Date(t.getTime() + 10),
          },
        ],
      });
    await expect(
      assertPostTakeoverRetrievalCustodyEvidence(tx(accepted), scope, conflict),
    ).resolves.toBeUndefined();
    const returned = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ birth_xid: "100" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            actor_membership_id: "B",
            after_epoch: true,
            event_type: "RETURNED_TO_SLOT",
            key_slot_id: "slot",
            occurred_at: new Date(t.getTime() + 10),
          },
        ],
      });
    await expect(
      assertPostTakeoverRetrievalCustodyEvidence(tx(returned), scope, conflict),
    ).rejects.toThrow("custody-integrity-conflict");
  });

  it("accepts B checkout in a later locked transaction within the same millisecond", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ birth_xid: "100" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            actor_membership_id: "B",
            after_epoch: true,
            event_type: "CHECKED_OUT",
            key_slot_id: "slot",
          },
        ],
      });
    await expect(
      assertPostTakeoverRetrievalCustodyEvidence(tx(query), scope, conflict),
    ).resolves.toBeUndefined();
    expect(query.mock.calls[1]![0]).toContain(
      "(pagination_birth_xid > $4::xid8) AS after_epoch",
    );
    expect(query.mock.calls[1]![1][3]).toBe("100");
  });

  it("orders DEC-068 same-time slot assignment before return despite reversed UUIDs", async () => {
    // UUID lexical order may put SLOT_ASSIGNED (ffff) after RETURNED (0000).
    // The database ORDER BY must use the documented write order instead.
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ birth_xid: "100" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            actor_membership_id: "B",
            after_epoch: true,
            event_type: "RETURNED_TO_SLOT",
            key_slot_id: "slot",
          },
        ],
      });
    await expect(
      assertPostTakeoverRetrievalCustodyEvidence(tx(query), scope, conflict),
    ).rejects.toThrow("custody-integrity-conflict");
    const orderSql = String(query.mock.calls[1]![0]);
    expect(orderSql).toContain("ORDER BY pagination_birth_xid DESC NULLS LAST");
    expect(orderSql).toMatch(
      /WHEN 'RETURNED_TO_SLOT' THEN 3\s+WHEN 'SLOT_ASSIGNED' THEN 2/,
    );
  });

  it("fails closed if the takeover event lacks an immutable birth marker", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ birth_xid: null }] });
    await expect(
      assertPostTakeoverRetrievalCustodyEvidence(tx(query), scope, conflict),
    ).rejects.toThrow("custody-integrity-conflict");
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe("owner-bound final release proof", () => {
  const session = {
    id: "session",
    organization_id: "org",
    location_id: "loc",
    state: "HANDOFF_PENDING",
    handoff_pending_at: t,
    ready_at: t,
    retrieval_requested_at: t,
    retrieval_started_at: t,
    version: 12,
  };
  const proof = {
    id: "proof",
    method: "PICKUP_CODE",
    verified_at: t,
    verified_by_membership_id: "A",
    expires_at: new Date(t.getTime() + 120_000),
  };

  it("rejects A's still unconsumed Standard proof when B owns the Task", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [proof] });
    await expect(
      lockReleaseEligibleHandoffVerification(tx(query), session, t, "B"),
    ).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("requires B's own verification and permitted live method policy", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ ...proof, verified_by_membership_id: "B" }],
      })
      .mockResolvedValueOnce({ rows: [{ policy: "EITHER" }] });
    await expect(
      lockReleaseEligibleHandoffVerification(tx(query), session, t, "B"),
    ).resolves.toEqual({ id: "proof", method: "PICKUP_CODE" });
  });

  it("leaves a separately authorized Supervisor override method separate", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ ...proof, method: "SUPERVISOR_OVERRIDE" }],
    });
    await expect(
      lockReleaseEligibleHandoffVerification(tx(query), session, t, "B"),
    ).resolves.toEqual({ id: "proof", method: "SUPERVISOR_OVERRIDE" });
  });
});
