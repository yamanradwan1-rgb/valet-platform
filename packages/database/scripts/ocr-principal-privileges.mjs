import {
  ocrMaintenanceFunctions, ocrOperatorFunctions,
} from "./ocr-privilege-policy.mjs";
import {
  clearOcrTableGrants, verifyOcrPrincipalPrivileges,
} from "./ocr-runtime-privileges.mjs";

export const ocrOperatorCapabilityRole = "vaylet_ocr_operator";
const safeRoleName = /^[a-z_][a-z0-9_]{0,62}$/;

async function roleFlags(client, role) {
  const { rows } = await client.query(`
    SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,
           rolbypassrls,rolinherit,oid
    FROM pg_roles WHERE rolname=$1`, [role]);
  return rows[0];
}

export async function provisionOcrOperatorCapability(client, formatted) {
  let current = await roleFlags(client, ocrOperatorCapabilityRole);
  if (!current) {
    // This requires a CREATEROLE-capable administration principal; it never
    // creates a login, password or human credential.
    await formatted(client,
      "CREATE ROLE %I WITH NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS",
      [ocrOperatorCapabilityRole]);
    current = await roleFlags(client, ocrOperatorCapabilityRole);
  }
  if (!current || current.rolcanlogin || current.rolinherit ||
      current.rolsuper || current.rolcreatedb || current.rolcreaterole ||
      current.rolreplication || current.rolbypassrls) {
    throw new Error("OCR operator capability has unsafe role attributes.");
  }
  // Once a dedicated operator login has been explicitly linked, the capability
  // is expected to have incoming membership. Never allow outgoing memberships.
  const { rows: outgoing } = await client.query(
    "SELECT count(*)::integer AS n FROM pg_auth_members WHERE member=$1::oid",
    [current.oid]);
  if (outgoing[0]?.n!==0) {
    throw new Error("OCR operator capability inherited an unrelated role.");
  }
  const { rows: owned } = await client.query(`
    SELECT EXISTS(SELECT 1 FROM pg_class WHERE relowner=$1::oid)
      OR EXISTS(SELECT 1 FROM pg_proc WHERE proowner=$1::oid)
      OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspowner=$1::oid)
      AS unsafe`, [current.oid]);
  if (owned[0]?.unsafe !== false) {
    throw new Error("OCR operator capability unexpectedly owns objects.");
  }
  await formatted(client, "REVOKE ALL ON SCHEMA public FROM %I",
    [ocrOperatorCapabilityRole]);
  await formatted(client, "REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I",
    [ocrOperatorCapabilityRole]);
  await formatted(client, "REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I",
    [ocrOperatorCapabilityRole]);
}

function approved(kind) {
  if (kind==="operator") return ocrOperatorFunctions;
  if (kind==="maintenance") return ocrMaintenanceFunctions;
  throw new Error("Unsupported OCR database principal kind.");
}

export async function provisionOcrPrincipal(client, formatted, kind, role, database) {
  const allow = approved(kind);
  if (!safeRoleName.test(role) || role===ocrOperatorCapabilityRole ||
      !safeRoleName.test(database)) {
    throw new Error("OCR principal name/database invalid.");
  }
  const executing = (await client.query("SELECT current_user AS role")).rows[0]?.role;
  if (!executing || executing===role) {
    throw new Error("OCR principal cannot provision itself.");
  }
  const flags=await roleFlags(client,role);
  if (!flags?.rolcanlogin || flags.rolinherit || flags.rolsuper ||
      flags.rolcreatedb || flags.rolcreaterole || flags.rolreplication ||
      flags.rolbypassrls) {
    throw new Error("OCR principal needs dedicated restricted login credentials.");
  }
  const { rows: owned }=await client.query(`
    SELECT EXISTS(SELECT 1 FROM pg_class WHERE relowner=$1::oid)
      OR EXISTS(SELECT 1 FROM pg_proc WHERE proowner=$1::oid)
      OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspowner=$1::oid)
      AS unsafe`, [flags.oid]);
  if (owned[0]?.unsafe !== false) {
    throw new Error("OCR principal must not own schema objects.");
  }
  const { rows: members }=await client.query(`
    SELECT target.rolname FROM pg_auth_members m
      JOIN pg_roles target ON target.oid=m.roleid
    WHERE m.member=$1::oid`, [flags.oid]);
  if (members.some(({ rolname })=>rolname!==ocrOperatorCapabilityRole) ||
      (kind==="maintenance" && members.length!==0)) {
    throw new Error("OCR principal has unrelated or forbidden role memberships.");
  }
  if (kind==="operator") {
    await provisionOcrOperatorCapability(client, formatted);
    if (members.length===0) {
      await formatted(client,"GRANT %I TO %I",
        [ocrOperatorCapabilityRole,role]);
    }
  }
  await formatted(client,"GRANT CONNECT ON DATABASE %I TO %I",[database,role]);
  await formatted(client,"REVOKE CREATE,TEMPORARY ON DATABASE %I FROM %I",
    [database,role]);
  await formatted(client,"REVOKE ALL ON SCHEMA public FROM %I",[role]);
  await formatted(client,"GRANT USAGE ON SCHEMA public TO %I",[role]);
  await formatted(client,"REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I",
    [role]);
  await formatted(client,"REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I",
    [role]);
  await clearOcrTableGrants(client,formatted,role);
  // Dedicated credentials never gain default read/execute on other features.
  await formatted(client,"REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I",[role]);
  for (const signature of allow) {
    await formatted(client,"GRANT EXECUTE ON FUNCTION %s TO %I",
      [signature,role]);
  }
  await verifyOcrPrincipal(client,kind,role);
}

export async function verifyOcrPrincipal(client, kind, role) {
  const allow=approved(kind);
  const flags=await roleFlags(client,role);
  if (!flags?.rolcanlogin || flags.rolinherit || flags.rolsuper ||
      flags.rolcreatedb || flags.rolcreaterole || flags.rolreplication ||
      flags.rolbypassrls) {
    throw new Error("OCR database login is unsafe.");
  }
  const { rows: groups }=await client.query(`
    SELECT target.rolname FROM pg_auth_members m
      JOIN pg_roles target ON target.oid=m.roleid
    WHERE m.member=$1::oid`, [flags.oid]);
  if (groups.length!==(kind==="operator"?1:0) ||
      groups.some(({rolname})=>rolname!==ocrOperatorCapabilityRole)) {
    throw new Error("OCR operator/maintenance role membership is unsafe.");
  }
  await verifyOcrPrincipalPrivileges(client,role,allow);
  const { rows: other }=await client.query(`
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S')
      AND left(c.relname,4)<>'ocr_'
      AND (has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        OR has_any_column_privilege($1,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))
    LIMIT 1`, [role]);
  if (other.length) throw new Error("OCR credential has access to unrelated tables.");
}
