import { createHash } from "node:crypto";

// Migration142 protects STAFF_LOGIN_SESSION_CREATED in the PUBLIC audit table.
// These two guards must be checked separately from the 32 private triggers.
export const PUBLIC_AUDIT_SHA256 =
  "0af938bf8e9f1dcfea844d72b9e5f7b9490ffee3fd7145b4d2f074825bf65341";

const PIN_FIELDS = Object.freeze([
  "schema_name",
  "table_name",
  "trigger_name",
  "enabled",
  "is_internal",
  "trigger_type",
  "deferrable",
  "initially_deferred",
  "handler",
  "handler_kind",
  "handler_args",
  "trigger_definition",
]);

export function publicAuditTriggerDigest(rows) {
  if (
    !Array.isArray(rows) ||
    rows.some(
      (row) => !row || PIN_FIELDS.some((field) => !Object.hasOwn(row, field)),
    )
  ) {
    throw new Error("W30_PG17_PUBLIC_AUDIT_FIELDS_UNPROVEN");
  }
  const sorted = [...rows].sort((a, b) =>
    a.trigger_name < b.trigger_name
      ? -1
      : a.trigger_name > b.trigger_name
        ? 1
        : 0,
  );
  const tuples = sorted.map((row) => PIN_FIELDS.map((field) => row[field]));
  return createHash("sha256")
    .update(JSON.stringify(tuples), "utf8")
    .digest("hex");
}
export const PUBLIC_AUDIT_TRIGGER_SQL = `
SELECT n.nspname AS schema_name, c.relname AS table_name,
 t.tgname AS trigger_name, t.tgenabled AS enabled,
 t.tgisinternal AS is_internal, t.tgtype AS trigger_type,
 t.tgdeferrable AS deferrable, t.tginitdeferred AS initially_deferred,
 pn.nspname || '.' || p.proname AS handler,
 p.prokind AS handler_kind, p.pronargs AS handler_args,
 pg_get_triggerdef(t.oid) AS trigger_definition
FROM pg_trigger t
JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_proc p ON p.oid=t.tgfoid
JOIN pg_namespace pn ON pn.oid=p.pronamespace
WHERE n.nspname='public' AND c.relname='account_security_audit_events'
  AND NOT t.tgisinternal
ORDER BY t.tgname`;

export function assertPublicAuditTriggers(rows) {
  if (
    !Array.isArray(rows) ||
    rows.length !== 2 ||
    new Set(rows.map((r) => r?.trigger_name)).size !== 2 ||
    rows.some(
      (r) =>
        !r ||
        r.schema_name !== "public" ||
        r.table_name !== "account_security_audit_events" ||
        r.enabled !== "O" ||
        r.is_internal !== false ||
        r.handler_kind !== "f" ||
        r.handler_args !== 0 ||
        typeof r.trigger_definition !== "string",
    )
  ) {
    throw new Error("W30_PG17_PUBLIC_AUDIT_TRIGGERS_UNPROVEN");
  }
  const immutable = rows.find(
    (r) => r.trigger_name === "issue416_a01_audit_immutable",
  );
  const receipt = rows.find(
    (r) => r.trigger_name === "issue416_a01_audit_receipt_complete",
  );
  if (
    !immutable ||
    immutable.trigger_type !== 31 ||
    immutable.deferrable !== false ||
    immutable.initially_deferred !== false ||
    immutable.handler !== "auth_proof_private.guard_a01_audit_mutation" ||
    !immutable.trigger_definition.startsWith(
      "CREATE TRIGGER issue416_a01_audit_immutable BEFORE INSERT OR DELETE OR UPDATE ON public.account_security_audit_events",
    ) ||
    !immutable.trigger_definition.endsWith(
      "EXECUTE FUNCTION auth_proof_private.guard_a01_audit_mutation()",
    ) ||
    !receipt ||
    receipt.trigger_type !== 5 ||
    receipt.deferrable !== true ||
    receipt.initially_deferred !== true ||
    receipt.handler !== "auth_proof_private.assert_a01_audit_receipt" ||
    !receipt.trigger_definition.startsWith(
      "CREATE CONSTRAINT TRIGGER issue416_a01_audit_receipt_complete AFTER INSERT ON public.account_security_audit_events",
    ) ||
    !receipt.trigger_definition.includes("DEFERRABLE INITIALLY DEFERRED") ||
    !receipt.trigger_definition.includes("STAFF_LOGIN_SESSION_CREATED") ||
    !receipt.trigger_definition.endsWith(
      "EXECUTE FUNCTION auth_proof_private.assert_a01_audit_receipt()",
    ) ||
    publicAuditTriggerDigest(rows) !== PUBLIC_AUDIT_SHA256
  ) {
    throw new Error("W30_PG17_PUBLIC_AUDIT_TRIGGERS_UNPROVEN");
  }
  return true;
}
