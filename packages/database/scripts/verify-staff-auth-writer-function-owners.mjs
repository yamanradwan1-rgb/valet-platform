export const staffAuthWriterDefinerFunctions = Object.freeze([
  "public.staff_onboarding_activate(text,text,text)",
  "public.s04_staff_login_success(uuid,text)",
  "public.s04_staff_activation_success(uuid,text,text,text,xid8,uuid,bigint,text)",
]);

export async function verifyStaffAuthWriterFunctionOwners(
  client,
  expectedOwner,
) {
  if (typeof expectedOwner !== "string" || expectedOwner.length === 0) {
    throw new Error("Staff Auth definer owner contract is missing.");
  }
  const result = await client.query(
    `WITH expected AS (
       SELECT $1::text AS signature,pg_catalog.to_regprocedure($1) AS oid
       UNION ALL SELECT $2::text,pg_catalog.to_regprocedure($2)
       UNION ALL SELECT $3::text,pg_catalog.to_regprocedure($3)
     )
     SELECT expected.signature,owner.rolname AS owner,
            function.prosecdef,function.proconfig
       FROM expected
       JOIN pg_catalog.pg_proc function ON function.oid=expected.oid
       JOIN pg_catalog.pg_roles owner ON owner.oid=function.proowner`,
    staffAuthWriterDefinerFunctions,
  );
  const owners = new Map(result.rows.map((row) => [row.signature, row]));
  if (
    result.rowCount !== staffAuthWriterDefinerFunctions.length ||
    staffAuthWriterDefinerFunctions.some((signature, index) => {
      const row = owners.get(signature);
      const searchPath =
        index === 0
          ? "search_path=pg_catalog, public"
          : "search_path=pg_catalog";
      return (
        row?.owner !== expectedOwner ||
        row.prosecdef !== true ||
        !Array.isArray(row.proconfig) ||
        row.proconfig.length !== 1 ||
        row.proconfig[0] !== searchPath
      );
    })
  ) {
    throw new Error(
      "Staff Auth protected functions are not owned by the trusted migration role.",
    );
  }
}
