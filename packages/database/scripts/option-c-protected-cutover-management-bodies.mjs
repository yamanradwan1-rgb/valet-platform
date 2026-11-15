// Canonical LF SHA-256 of each exact S03 PL/pgSQL body. A previously applied
// migration with stale hash-based bearer authorization must never be admitted
// by a protected cutover merely because Prisma reports its name as applied.
export const pinnedOptionCManagementBodies = Object.freeze([
  ["public.staff_management_authorize_writer(uuid,uuid,text,uuid,uuid)",
    "5d8cc0f3dfd483f67fef5dc8bb03085c4c10afbda15168938c775502f91e0a3f"],
  ["public.staff_management_touch_writer_activity(uuid,uuid,text)",
    "4b4a78780567f57afd3da5ef6380cd8f11300bf99511c131c7650420ae8daf52"],
  ["public.staff_management_authorized_set_role(uuid,uuid,text,uuid,uuid,uuid,integer,public.membership_role)",
    "2ffe5da3c0d1dd389847f8fb04cbdefd11c8d4f7645c4a426f71d9389effd917"],
  ["public.staff_management_authorized_set_status(uuid,uuid,text,uuid,uuid,uuid,integer,public.membership_status)",
    "f6d93e0459a000e1864ffb60058797b90cc4a1ac6e5e81c3eebbcb304f4c92e2"],
  ["public.staff_management_authorized_set_location_access(uuid,uuid,text,uuid,uuid,uuid,integer,uuid[],boolean)",
    "0c643e43297ed082d9a5bb078f06a9d2d9273e542f6e9cc525ec434025286710"],
  ["public.staff_management_authorized_onboarding_create(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,public.membership_role,uuid[],text)",
    "fc0c5c856215383fff10bd9feb0c1966d7f32a9c4e6979d14001978132bf5be9"],
  ["public.staff_management_authorized_onboarding_resend(uuid,uuid,text,uuid,uuid,uuid,uuid,text,text)",
    "4716521d120f7b7c8f5e091daafbad9c758fd770c592de5a7eb1c84e7473bcf5"],
]);

export async function verifyOptionCManagementBodies(client) {
  for (const [signature, expected] of pinnedOptionCManagementBodies) {
    const result = await client.query(
      `SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
                pg_catalog.replace(function.prosrc,
                  pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),
                'UTF8')),'hex') AS body_sha256
         FROM pg_catalog.pg_proc AS function
        WHERE function.oid=pg_catalog.to_regprocedure($1)`,
      [signature],
    );
    if (result.rowCount !== 1 || result.rows[0]?.body_sha256 !== expected) {
      throw new Error(`Option C S03 installed function differs from approved bearer contract: ${signature}.`);
    }
  }
}
