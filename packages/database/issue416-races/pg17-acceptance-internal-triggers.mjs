// Every private FK has four actual PostgreSQL RI triggers: two on its source
// table and two on the referenced table (which may be in public). Checking
// only private-schema triggers would miss a disabled public referenced side.
export const INTERNAL_RI_TRIGGER_SQL = `
SELECT co.oid::integer AS constraint_id,
 co.conname AS constraint_name, co.conrelid::regclass::text AS constraint_table,
 co.contype AS constraint_kind, co.confdeltype AS delete_action,
 co.confupdtype AS update_action,
 refns.nspname AS referenced_schema, ref.relname AS referenced_table,
 tn.nspname AS trigger_schema, tclass.relname AS trigger_table,
 t.tgname AS trigger_name, t.tgenabled AS enabled,
 t.tgisinternal AS is_internal, t.tgtype AS trigger_type,
 p.proname AS handler
FROM pg_constraint co
JOIN pg_namespace cn ON cn.oid=co.connamespace
JOIN pg_class ref ON ref.oid=co.confrelid
JOIN pg_namespace refns ON refns.oid=ref.relnamespace
JOIN pg_trigger t ON t.tgconstraint=co.oid
JOIN pg_class tclass ON tclass.oid=t.tgrelid
JOIN pg_namespace tn ON tn.oid=tclass.relnamespace
JOIN pg_proc p ON p.oid=t.tgfoid
WHERE cn.nspname='auth_proof_private' AND co.contype='f'`;

export function assertInternalRiTriggers(rows) {
  if (!Array.isArray(rows) || rows.length !== 92) {
    throw new Error("W30_PG17_INTERNAL_RI_TRIGGER_UNPROVEN");
  }
  const groups = new Map();
  const fkActionNames = Object.freeze({
    a: "noaction",
    r: "restrict",
    c: "cascade",
    n: "setnull",
    d: "setdefault",
  });
  for (const row of rows) {
    if (
      !row ||
      !Number.isSafeInteger(row.constraint_id) ||
      row.constraint_id < 1 ||
      typeof row.constraint_name !== "string" ||
      !row.constraint_name ||
      typeof row.constraint_table !== "string" ||
      !row.constraint_table.startsWith("auth_proof_private.") ||
      !Object.hasOwn(fkActionNames, row.delete_action) ||
      !Object.hasOwn(fkActionNames, row.update_action) ||
      !["auth_proof_private", "public"].includes(row.referenced_schema) ||
      typeof row.referenced_table !== "string" ||
      !row.referenced_table ||
      !["auth_proof_private", "public"].includes(row.trigger_schema) ||
      typeof row.trigger_table !== "string" ||
      typeof row.trigger_name !== "string" ||
      !row.trigger_name ||
      row.constraint_kind !== "f" ||
      row.is_internal !== true ||
      row.enabled !== "O" ||
      ![5, 9, 17].includes(row.trigger_type) ||
      typeof row.handler !== "string" ||
      !row.handler.startsWith("RI_FKey_")
    ) {
      throw new Error("W30_PG17_INTERNAL_RI_TRIGGER_UNPROVEN");
    }
    const list = groups.get(row.constraint_id) ?? [];
    list.push(row);
    groups.set(row.constraint_id, list);
  }
  if (
    groups.size !== 23 ||
    [...groups.values()].some((group) => {
      const baseline = group[0];
      const expected = [
        [
          "RI_FKey_check_ins",
          5,
          "auth_proof_private",
          baseline.constraint_table.slice("auth_proof_private.".length),
        ],
        [
          "RI_FKey_check_upd",
          17,
          "auth_proof_private",
          baseline.constraint_table.slice("auth_proof_private.".length),
        ],
        [
          `RI_FKey_${fkActionNames[baseline.delete_action]}_del`,
          9,
          baseline.referenced_schema,
          baseline.referenced_table,
        ],
        [
          `RI_FKey_${fkActionNames[baseline.update_action]}_upd`,
          17,
          baseline.referenced_schema,
          baseline.referenced_table,
        ],
      ];
      return (
        group.length !== 4 ||
        new Set(group.map((row) => row.trigger_name)).size !== 4 ||
        group.some(
          (row) =>
            row.constraint_name !== baseline.constraint_name ||
            row.constraint_table !== baseline.constraint_table ||
            row.delete_action !== baseline.delete_action ||
            row.update_action !== baseline.update_action ||
            row.referenced_schema !== baseline.referenced_schema ||
            row.referenced_table !== baseline.referenced_table,
        ) ||
        expected.some(
          ([handler, kind, schema, table]) =>
            group.filter(
              (row) =>
                row.handler === handler &&
                row.trigger_type === kind &&
                row.trigger_schema === schema &&
                row.trigger_table === table,
            ).length !== 1,
        )
      );
    })
  ) {
    throw new Error("W30_PG17_INTERNAL_RI_TRIGGER_UNPROVEN");
  }
  return true;
}
