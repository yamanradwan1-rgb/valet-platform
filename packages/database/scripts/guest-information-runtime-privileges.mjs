export const guestInformationReadOnlyTables = [
  "guest_location_privacy",
  "guest_privacy_publications",
  "guest_contact_company_defaults",
  "guest_contact_location_overrides",
];

export const guestInformationWriteFunctions = [
  "public.guest_information_save_privacy(uuid,uuid,uuid,text,text,text,text,integer)",
  "public.guest_information_publish_privacy(uuid,uuid,uuid,integer)",
  "public.guest_information_unpublish_privacy(uuid,uuid,uuid,integer)",
  "public.guest_information_set_company_contact(uuid,uuid,text,text,text,text,boolean,integer)",
  "public.guest_information_set_location_contact(uuid,uuid,uuid,guest_contact_field_mode,text,guest_contact_field_mode,text,guest_contact_field_mode,text,guest_contact_field_mode,text,boolean,integer)",
];

export const guestInformationPrivateFunctions = [
  "public.guest_information_authorize_actor(uuid,uuid,uuid)",
  "public.guest_information_append_audit(uuid,uuid,uuid,text,integer)",
  "public.guest_privacy_forbid_publication_change()",
  "public.guest_information_https_url_valid(text)",
];

export async function provisionGuestInformationPrivileges(
  client,
  executeFormatted,
  role,
) {
  for (const table of guestInformationReadOnlyTables) {
    await client.query(`REVOKE ALL ON TABLE public.${table} FROM PUBLIC`);
    await executeFormatted(client, "REVOKE ALL ON TABLE %I FROM %I", [
      table,
      role,
    ]);
    await executeFormatted(client, "GRANT SELECT ON TABLE %I TO %I", [
      table,
      role,
    ]);
  }
  for (const name of guestInformationWriteFunctions) {
    await executeFormatted(client, "REVOKE ALL ON FUNCTION %s FROM %I", [
      name,
      role,
    ]);
    await executeFormatted(client, "GRANT EXECUTE ON FUNCTION %s TO %I", [
      name,
      role,
    ]);
  }
  for (const name of guestInformationPrivateFunctions) {
    await executeFormatted(client, "REVOKE ALL ON FUNCTION %s FROM %I", [
      name,
      role,
    ]);
  }
}

export async function verifyGuestInformationPrivileges(client, role) {
  for (const table of guestInformationReadOnlyTables) {
    for (const [privilege, allowed] of [
      ["SELECT", true],
      ["INSERT", false],
      ["UPDATE", false],
      ["DELETE", false],
      ["TRUNCATE", false],
      ["REFERENCES", false],
      ["TRIGGER", false],
    ]) {
      const result = await client.query(
        "SELECT has_table_privilege($1,$2,$3) AS allowed",
        [role, `public.${table}`, privilege],
      );
      if (result.rows[0]?.allowed !== allowed) {
        throw new Error(
          `Unsafe Guest information table privileges: ${table} ${privilege}`,
        );
      }
    }
  }
  for (const name of guestInformationWriteFunctions) {
    const result = await client.query(
      `SELECT has_function_privilege($1,p.oid,'EXECUTE') AS allowed,
              p.prosecdef AS definer,
              p.proconfig=ARRAY['search_path=pg_catalog, public']::text[] AS safe_path,
              p.proowner<>r.oid AS independent_owner,
              NOT EXISTS (
                SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl
                WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'
              ) AS public_denied
       FROM pg_proc p JOIN pg_roles r ON r.rolname=$1
       WHERE p.oid=to_regprocedure($2)`,
      [role, name],
    );
    const state = result.rows[0];
    if (!state || !Object.values(state).every((value) => value === true)) {
      throw new Error(`Unsafe Guest information write authority: ${name}`);
    }
  }
  for (const name of guestInformationPrivateFunctions) {
    const result = await client.query(
      `SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed,
              NOT EXISTS (
                SELECT 1 FROM pg_proc p,
                  LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl
                WHERE p.oid=to_regprocedure($2)
                  AND acl.grantee=0 AND acl.privilege_type='EXECUTE'
              ) AS public_denied`,
      [role, name],
    );
    if (
      result.rows[0]?.allowed !== false ||
      result.rows[0]?.public_denied !== true
    ) {
      throw new Error(`Unsafe Guest information private function: ${name}`);
    }
  }
}
