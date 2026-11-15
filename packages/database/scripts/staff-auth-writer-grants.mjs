export const writerTableColumns = {
  users: {
    SELECT: ["id", "password_hash", "status"],
    UPDATE: ["last_login_at", "updated_at"],
  },
  staff_auth_sessions: {
    SELECT: [
      "id",
      "user_id",
      "current_access_token_hash",
      "access_expires_at",
      "absolute_expires_at",
      "revoked_at",
    ],
    INSERT: [
      "id",
      "user_id",
      "current_access_token_hash",
      "access_expires_at",
      "absolute_expires_at",
      "created_at",
      "last_rotated_at",
    ],
    UPDATE: [
      "current_access_token_hash",
      "access_expires_at",
      "last_rotated_at",
      "revoked_at",
    ],
  },
  staff_refresh_credentials: {
    SELECT: [
      "id",
      "session_id",
      "token_hash",
      "generation",
      "expires_at",
      "consumed_at",
      "replaced_by_credential_id",
    ],
    INSERT: [
      "id",
      "session_id",
      "token_hash",
      "generation",
      "created_at",
      "expires_at",
    ],
    UPDATE: ["consumed_at", "replaced_by_credential_id"],
  },
  staff_push_registrations: {
    SELECT: ["staff_auth_session_id", "state"],
    UPDATE: [
      "state",
      "provider_token",
      "terminal_at",
      "terminal_reason_class",
      "updated_at",
    ],
  },
};

async function revokeColumnGrants(client, exec, role, onlyStaffAuth) {
  const tables = await client.query(
    `SELECT cls.relname AS table_name,
            array_agg(att.attname::text ORDER BY att.attnum) AS columns
       FROM pg_class cls JOIN pg_namespace ns ON ns.oid=cls.relnamespace
       JOIN pg_attribute att ON att.attrelid=cls.oid
         AND att.attnum>0 AND NOT att.attisdropped
       WHERE ns.nspname='public' AND cls.relkind IN ('r','p')
         AND (NOT $1 OR cls.relname IN ('staff_auth_sessions','staff_refresh_credentials'))
       GROUP BY cls.relname`,
    [onlyStaffAuth],
  );
  for (const table of tables.rows) {
    const privileges = ["SELECT", "INSERT", "UPDATE", "REFERENCES"];
    // PostgreSQL format() accepts at most 100 arguments. Four privilege types
    // over a wide table can otherwise abort the entire protected provisioning.
    for (let offset = 0; offset < table.columns.length; offset += 20) {
      const columns = table.columns.slice(offset, offset + 20);
      const fragment = privileges
        .map((name) => `${name} (${columns.map(() => "%I").join(", ")})`)
        .join(", ");
      const values = [...privileges.flatMap(() => columns), table.table_name];
      if (role === "PUBLIC") {
        await exec(
          client,
          `REVOKE ${fragment} ON TABLE public.%I FROM PUBLIC`,
          values,
        );
      } else {
        await exec(client, `REVOKE ${fragment} ON TABLE public.%I FROM %I`, [
          ...values,
          role,
        ]);
      }
    }
  }
}

export async function applyStaffAuthWriterGrants(
  client,
  exec,
  role,
  runtimeRole,
) {
  await exec(client, "REVOKE ALL ON SCHEMA public FROM %I", [role]);
  await exec(client, "GRANT USAGE ON SCHEMA public TO %I", [role]);
  // Other protected functions may be owned by separate NOLOGIN roles (photo
  // evidence, etc.). PostgreSQL rejects a schema-wide FUNCTION REVOKE by the
  // migrator when it cannot administer one of those unrelated owners. Revoke
  // our two exact functions below and fail closed on unexpected EXECUTE in the
  // writer verifier instead of widening migrator SET/ownership privileges.
  for (const objectType of ["TABLES", "SEQUENCES"]) {
    await exec(
      client,
      `REVOKE ALL ON ALL ${objectType} IN SCHEMA public FROM %I`,
      [role],
    );
  }
  await revokeColumnGrants(client, exec, role, false);
  // Existing migrations previously allowed ordinary runtime to mint staff bearers.
  // Always remove these writes, including on subsequent runtime reprovision.
  await client.query(
    `REVOKE ALL ON TABLE public.staff_auth_sessions, public.staff_refresh_credentials FROM PUBLIC`,
  );
  await exec(
    client,
    "REVOKE ALL ON TABLE public.staff_auth_sessions, public.staff_refresh_credentials FROM %I",
    [runtimeRole],
  );
  await revokeColumnGrants(client, exec, "PUBLIC", true);
  await revokeColumnGrants(client, exec, runtimeRole, true);
  for (const [table, privileges] of Object.entries(writerTableColumns)) {
    for (const [privilege, columns] of Object.entries(privileges)) {
      await exec(
        client,
        `GRANT ${privilege} (${columns.map(() => "%I").join(", ")}) ON TABLE public.%I TO %I`,
        [...columns, table, role],
      );
    }
  }
  await exec(
    client,
    "REVOKE ALL ON FUNCTION public.staff_onboarding_activate(text,text,text) FROM %I",
    [runtimeRole],
  );
  await client.query(
    "REVOKE ALL ON FUNCTION public.staff_onboarding_activate(text,text,text) FROM PUBLIC",
  );
  await exec(
    client,
    "GRANT EXECUTE ON FUNCTION public.staff_onboarding_activate(text,text,text) TO %I",
    [role],
  );
  await exec(
    client,
    "REVOKE ALL ON FUNCTION public.s04_staff_login_success(uuid,text) FROM %I",
    [runtimeRole],
  );
  await client.query(
    "REVOKE ALL ON FUNCTION public.s04_staff_login_success(uuid,text) FROM PUBLIC",
  );
  await exec(
    client,
    "GRANT EXECUTE ON FUNCTION public.s04_staff_login_success(uuid,text) TO %I",
    [role],
  );
  // Ordinary readers retain precisely the MFA assurance/logout compatibility.
  await exec(
    client,
    "GRANT SELECT ON TABLE public.staff_auth_sessions, public.staff_refresh_credentials TO %I",
    [runtimeRole],
  );
  // Staff Auth may only permit one-way logout revocation to ordinary SQL.
  // MFA assurance/activity belongs exclusively to the S02 protected boundary.
  // Replaying this provisioner after S02 must never restore forged assurance.
  for (const column of ["revoked_at"]) {
    await exec(
      client,
      "GRANT UPDATE (%I) ON TABLE public.staff_auth_sessions TO %I",
      [column, runtimeRole],
    );
  }
}
