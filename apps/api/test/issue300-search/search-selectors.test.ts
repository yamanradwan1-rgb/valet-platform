import { describe, expect, it, vi } from "vitest";
import { auditInvestigationFilterResponseSchema } from "@valet/contracts";
import { managementAuditKnownEventTypes } from "../../src/modules/management/management-audit-event-catalog";
import type { PostgresTransaction } from "../../src/common/database/postgres";
import {
  auditInvestigationSelectorStatements,
  escapeSelectorPrefix,
  listAuditInvestigationFilterOptions,
} from "../../src/modules/management/audit-investigation/search/search-selector-query";
import { requireCanonicalInvestigationSelectors } from
  "../../src/modules/management/audit-investigation/search/search-selector-authorization";

const org = "10000000-0000-4000-8000-000000000001";
const loc = "10000000-0000-4000-8000-000000000002";
const membership = "10000000-0000-4000-8000-000000000003";
const scope = { organizationId: org, locationId: loc, membershipId: membership,
  role: "LOCATION_MANAGER" as const };

function fake(rows: readonly {id: string;label: string | null}[]) {
  const spy = vi.fn(async (sql: string, args: readonly unknown[]) => {
    void sql;
    void args;
    return { rows };
  });
  return { spy, transaction: { query: spy } as unknown as PostgresTransaction };
}

describe("#300 bounded canonical selectors without DB", () => {
  it("escapes user prefix as a literal and retains Unicode case folding", () => {
    expect(escapeSelectorPrefix("ab%_\\CD")).toBe("ab\\%\\_\\\\cd%");
    expect(escapeSelectorPrefix(undefined)).toBeNull();
  });

  it("includes inactive staff by historical participation, never current assignee or contact", () => {
    const sql = auditInvestigationSelectorStatements.memberSql;
    expect(sql).toContain("organization_memberships member");
    expect(sql).not.toContain("member.status = 'ACTIVE'");
    expect(sql).not.toContain("current_assignee_membership_id");
    expect(sql).not.toMatch(/\b(phone|email|description)\b/i);
    expect(sql).not.toMatch(/AS\s+metadata_json/i);
    expect(sql).toContain("a.metadata_json->>'taskId'");
    expect(sql).toContain("i.reported_by_membership_id");
    expect(sql).toContain("d.previous_assignee_membership_id");
  });

  it("is scoped, bounded to limit+1, and discloses no contact fallback", async () => {
    const id = "10000000-0000-4000-8000-000000000005";
    const {transaction,spy} = fake([
      {id, label: "Ali Hasan"},
      {id: "10000000-0000-4000-8000-000000000006",label: null},
      {id: "10000000-0000-4000-8000-000000000007",label: "Not in page"},
    ]);
    const result = await listAuditInvestigationFilterOptions(transaction, scope, {
      kind: "MEMBER", limit: 2, text: "Ali",
    });
    expect(spy.mock.calls[0]?.[0]).toBe(auditInvestigationSelectorStatements.memberSql);
    expect(spy.mock.calls[0]?.[1]).toEqual([org,loc,"ali%",3,null,managementAuditKnownEventTypes]);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBeNull();
    expect(result.items[1]?.currentLabel).toEqual({
      value: null, basis: "CURRENT", unavailable: true,
    });
    expect(auditInvestigationFilterResponseSchema.safeParse(result).success).toBe(true);
  });

  it("preserves physical Key Slot UUID and exact code while offering bounded prefix", async () => {
    const id = "10000000-0000-4000-8000-000000000004";
    const {transaction,spy} = fake([{id,label:"K-07"}]);
    const result = await listAuditInvestigationFilterOptions(transaction, scope, {
      kind: "KEY_SLOT",limit:20,text:"K-",
    });
    expect(spy.mock.calls[0]?.[0]).toBe(auditInvestigationSelectorStatements.slotSql);
    expect(spy.mock.calls[0]?.[1]).toEqual([org,loc,"k-%",21]);
    expect(result.items[0]?.id).toBe(id);
    expect(result.items[0]?.currentLabel.value).toBe("K-07");
  });

  it("denies foreign or unknown slot before searching witnesses", async () => {
    const {transaction,spy} = fake([]);
    await expect(requireCanonicalInvestigationSelectors(transaction,scope,{
      keySlotId:"10000000-0000-4000-8000-000000000008",
    })).rejects.toThrow();
    const [statement,parameters]=spy.mock.calls[0]!;
    expect(statement).toContain("organization_id = $1::uuid AND location_id = $2::uuid");
    expect(parameters).toEqual([org,loc,"10000000-0000-4000-8000-000000000008"]);
  });

  it("validates inactive historical membership in exact Location by persisted event participation", async () => {
    const {transaction,spy} = fake([{id:membership,label:null}]);
    await requireCanonicalInvestigationSelectors(transaction,scope,{membershipId:membership});
    const sql=spy.mock.calls[0]![0];
    expect(sql).toContain("member.organization_id = $1::uuid");
    expect(sql).toContain("k.location_id = $2::uuid");
    expect(sql).toContain("d.previous_assignee_membership_id");
    expect(sql).not.toContain("member.status = 'ACTIVE'");
    expect(sql).not.toContain("current_assignee_membership_id");
    expect(sql).toContain("a.event_type::text = ANY($4::text[])");
    expect(spy.mock.calls[0]?.[1]).toEqual([
      org, loc, membership, managementAuditKnownEventTypes,
    ]);
  });
});
