// Public SQL objects shared by each of the 35 inventoried flows. A granted
// column/function is a capability, never a credential ceremony or closed flow.
// Private typed writers, application provenance and external P02 require
// separate review; this is deliberately NOT a 35-writer acceptance oracle.
export const familyPublicRelations = Object.freeze({
  A01: [
    "users",
    "staff_auth_sessions",
    "staff_refresh_credentials",
    "anti_abuse_events",
  ],
  A02: ["users", "staff_auth_sessions", "staff_refresh_credentials"],
  A03: ["staff_auth_sessions", "staff_push_registrations"],
  A04: ["staff_auth_sessions", "user_mfa_totp_factors"],
  A05: ["staff_auth_sessions", "user_mfa_totp_factors", "mfa_recovery_codes"],
  A06: ["staff_auth_sessions", "user_mfa_totp_factors"],
  A07: ["staff_auth_sessions", "user_mfa_totp_factors", "mfa_recovery_codes"],
  A08: ["staff_auth_sessions", "user_mfa_totp_factors", "mfa_recovery_codes"],
  A09: ["staff_auth_sessions", "user_mfa_totp_factors"],
  A10: ["users", "staff_auth_sessions"],
  A11: ["staff_auth_sessions", "user_mfa_totp_factors"],
  M01: ["organization_memberships", "staff_auth_sessions"],
  M02: ["organization_memberships", "staff_auth_sessions"],
  M03: ["membership_location_access", "organization_memberships"],
  M04: ["staff_onboarding_invitations", "organization_memberships"],
  M05: ["staff_onboarding_invitations", "organization_memberships"],
  M06: ["staff_onboarding_invitations", "users", "organization_memberships"],
  M07: ["staff_auth_sessions", "organizations", "organization_memberships"],
  M08: ["organizations", "locations"],
  M09: ["organizations", "locations"],
  M10: ["organizations", "locations", "organization_memberships"],
  M11: ["staff_push_registrations", "staff_auth_sessions"],
  M12: ["staff_push_registrations", "staff_auth_sessions"],
  M13: ["staff_push_registrations", "staff_push_deliveries"],
  M14: ["users", "staff_auth_sessions", "staff_push_registrations"],
  M15: ["users", "user_mfa_totp_factors"],
  P01: ["users", "organization_memberships", "membership_location_access"],
  P02: ["organizations", "organization_subscriptions"],
  P03: ["users", "staff_auth_sessions", "staff_refresh_credentials"],
  P04: [
    "organizations",
    "organization_memberships",
    "membership_location_access",
  ],
  P05: ["staff_push_registrations", "staff_push_deliveries"],
  R01: ["users", "staff_auth_sessions", "organization_memberships"],
  R02: ["users", "organization_memberships", "anti_abuse_events"],
  R03: ["users", "staff_auth_sessions", "anti_abuse_events"],
  X01: ["shifts", "tasks", "organization_memberships"],
});

function familyMatches(group, id) {
  if (group === id) return true;
  const parts = group.split("-");
  if (parts.length !== 2) return false;
  if (parts[0][0] !== id[0] || parts[1][0] !== id[0]) return false;
  return (
    Number(id.slice(1)) >= Number(parts[0].slice(1)) &&
    Number(id.slice(1)) <= Number(parts[1].slice(1))
  );
}

export async function observeFamilyPublicSqlAuthority(
  client,
  runtimeRole,
  catalog,
  legacy,
) {
  if (
    catalog.rows.length !== 35 ||
    catalog.problems.length ||
    new Set(catalog.rows.map(({ id }) => id)).size !== 35 ||
    legacy.problems.length ||
    Object.keys(familyPublicRelations).length !== 35 ||
    catalog.rows.some(({ id }) => !familyPublicRelations[id]?.length)
  )
    throw new Error("W26_FAMILY_SQL_AUTHORITY_MAP_INCOMPLETE");
  const cache = new Map();
  async function table(name) {
    if (cache.has(name)) return cache.get(name);
    const result = await client.query(
      "SELECT pg_catalog.to_regclass($2) IS NOT NULL AS present, " +
        "pg_catalog.has_table_privilege($1,pg_catalog.to_regclass($2),'SELECT') AS read, " +
        "pg_catalog.has_any_column_privilege($1,pg_catalog.to_regclass($2),'INSERT') AS ins, " +
        "pg_catalog.has_any_column_privilege($1,pg_catalog.to_regclass($2),'UPDATE') AS upd, " +
        "pg_catalog.has_table_privilege($1,pg_catalog.to_regclass($2),'DELETE') AS del",
      [runtimeRole, "public." + name],
    );
    if (result.rowCount !== 1) throw new Error("W26_FAMILY_SQL_ACL_UNKNOWN");
    const observed = { relation: name, ...result.rows[0] };
    cache.set(name, observed);
    return observed;
  }
  const rows = [];
  for (const family of catalog.rows) {
    const relations = [];
    for (const name of familyPublicRelations[family.id]) {
      relations.push(await table(name));
    }
    const oldFunctions = legacy.signatures
      .filter(({ family: group }) => familyMatches(group, family.id))
      .map(({ signature }) => signature);
    rows.push({
      family: family.id,
      class: family.class,
      sourceFootprintNotCompleteProof: true,
      sharedPublicRelationAuthority: relations,
      inventoriedLegacyFunctionSignatures: oldFunctions.length,
      // Grouped M01-M03/M04-M06 old function lists must not be mistaken
      // for one individually reauthorized callable per family.
      oldFunctionGroupMayOverlap: oldFunctions.length > 1,
    });
  }
  return {
    observedFamilies: rows.length,
    sourceFootprintOnly: true,
    neitherPurposeBoundNorClosed: true,
    rows,
  };
}
