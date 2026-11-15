import { describe, expect, it } from "vitest";
import {
  AUDIENCE, ISSUE_SCOPES, REDEEM_SCOPES, attestedQuotaClient,
  expectSavepointRejection, quotaKey, reserveQuota, syntheticRequest,
  withQuotaRollback,
} from "./pg17-quota-fixture.mjs";

describe("Issue416 R02/R03 PG17 ACL and ABI — NOT RUN", () => {
  it("denies runtime private-table/owner/function capabilities", async () => {
    const client = await attestedQuotaClient("DATABASE_URL");
    try {
      const { rows } = await client.query(
        "SELECT has_schema_privilege(current_user,'auth_proof_private','USAGE') AS schema_use," +
        "has_table_privilege(current_user,'auth_proof_private.reset_issue_quota_entries','INSERT') AS insert_row," +
        "has_table_privilege(current_user,'auth_proof_private.reset_issue_quota_entries','UPDATE') AS update_row," +
        "has_table_privilege(current_user,'auth_proof_private.reset_issue_quota_bundles','DELETE') AS delete_bundle," +
        "pg_catalog.pg_has_role(current_user,'vap1_proof_owner','SET') AS owner_set," +
        "has_function_privilege(current_user," +
        "'auth_proof_private.reserve_reset_issue_quota(text,uuid,bytea,uuid,uuid,uuid,uuid,uuid,text,text,text,text)'," +
        "'EXECUTE') AS issue_execute," +
        "has_function_privilege(current_user," +
        "'auth_proof_private.reconcile_reset_issue_quota(text,uuid)'," +
        "'EXECUTE') AS reconcile_execute",
      );
      expect(Object.values(rows[0]).every((value) => value === false)).toBe(true);
    } finally {
      await client.end();
    }
  });

  it("requires legacy public limiter mutation grants closed before cutover", async () => {
    const client = await attestedQuotaClient("DATABASE_URL");
    try {
      const { rows } = await client.query(
        "SELECT " +
        "has_any_column_privilege(current_user,'public.anti_abuse_events','UPDATE') AS old_update," +
        "has_table_privilege(current_user,'public.anti_abuse_events','DELETE') AS old_delete," +
        "has_table_privilege(current_user,'public.anti_abuse_events','TRUNCATE') AS old_truncate",
      );
      // Expected RED while legacy grant survives. Do not cut over until closed.
      expect(rows).toEqual([{
        old_update: false, old_delete: false, old_truncate: false,
      }]);
    } finally {
      await client.end();
    }
  });

  it("rejects private reservation UUID against old public-limiter FK", async () => {
    await withQuotaRollback(async (client) => {
      const { rows: catalog } = await client.query(
        "SELECT c.oid FROM pg_catalog.pg_constraint c " +
        "WHERE c.conrelid='auth_proof_private.limiter_bindings'::regclass " +
        "AND c.contype='f' AND c.confrelid='public.anti_abuse_events'::regclass",
      );
      expect(catalog).toHaveLength(1); // This is an unresolved ABI BLOCKER.
      const request = syntheticRequest();
      const issued = await reserveQuota(client, request);
      expect(issued.reservation_ids).toHaveLength(4);
      const { rows: legacy } = await client.query(
        "SELECT id FROM public.anti_abuse_events WHERE id = ANY($1::uuid[])",
        [issued.reservation_ids],
      );
      expect(legacy).toHaveLength(0);
      const digest = Buffer.from(request.keys[0].split(":")[2], "hex");
      await expectSavepointRejection(client, () => client.query(
        "INSERT INTO auth_proof_private.limiter_bindings " +
        "(reservation_id,audience,operation_id,purpose,scope,key_digest) " +
        "VALUES ($1,$2,$3,'RESET_ISSUE',$4,$5)",
        [issued.reservation_ids[0], AUDIENCE, request.operationId,
          ISSUE_SCOPES[0][0], digest],
      ), "23503");
    });
  });

  it("requires both independent R03 scopes in a future public CHECK", async () => {
    const client = await attestedQuotaClient();
    try {
      const { rows } = await client.query(
        "SELECT pg_catalog.pg_get_constraintdef(c.oid) AS ddl " +
        "FROM pg_catalog.pg_constraint c WHERE " +
        "c.conrelid='public.anti_abuse_events'::regclass " +
        "AND c.conname='anti_abuse_events_scope_check'",
      );
      expect(rows).toHaveLength(1);
      // Intentionally RED until approved forward-only R03 migration arrives.
      for (const [scope] of REDEEM_SCOPES) expect(rows[0].ddl).toContain(scope);
    } finally {
      await client.end();
    }
  });

  it("never substitutes any R02 entry for a redeem reservation", async () => {
    await withQuotaRollback(async (client) => {
      const request = syntheticRequest();
      await reserveQuota(client, request);
      const { rows } = await client.query(
        "SELECT scope FROM auth_proof_private.reset_issue_quota_entries " +
        "WHERE audience=$1 AND operation_id=$2",
        [AUDIENCE, request.operationId],
      );
      expect(rows.map((row) => row.scope).sort())
        .toEqual(ISSUE_SCOPES.map(([scope]) => scope).sort());
      for (const [scope, cap] of REDEEM_SCOPES) {
        expect(rows.some((row) => row.scope === scope)).toBe(false);
        expect(cap).toBe(scope.endsWith("-credential") ? 5 : 30);
        expect(quotaKey(scope, request.marker)).not.toEqual(request.keys[0]);
      }
    });
  });
});
