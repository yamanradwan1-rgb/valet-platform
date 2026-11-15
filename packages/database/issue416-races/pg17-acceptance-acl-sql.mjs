export const ACL_SQL = `
SELECT n.nspname AS schema_name, c.relname AS table_name,
 c.relkind AS relation_kind,
 has_table_privilege($1::name, c.oid, 'SELECT') AS select_allowed,
 has_table_privilege($1::name, c.oid, 'INSERT') AS insert_allowed,
 has_table_privilege($1::name, c.oid, 'UPDATE') AS update_allowed,
 has_table_privilege($1::name, c.oid, 'DELETE') AS delete_allowed,
 has_table_privilege($1::name, c.oid, 'TRUNCATE') AS truncate_allowed,
 has_any_column_privilege($1::name, c.oid, 'INSERT') AS column_insert_allowed,
 has_any_column_privilege($1::name, c.oid, 'UPDATE') AS column_update_allowed,
 has_any_column_privilege($1::name, c.oid, 'SELECT') AS column_select_allowed,
 pg_get_userbyid(c.relowner) AS table_owner,
 pg_has_role($1::name, c.relowner, 'MEMBER') AS owner_membership,
 EXISTS (SELECT 1 FROM pg_attribute a
         CROSS JOIN LATERAL aclexplode(COALESCE(a.attacl,acldefault('c',c.relowner))) acl
         WHERE a.attrelid = c.oid AND a.attnum > 0
           AND NOT a.attisdropped AND acl.grantee = 0
           AND acl.privilege_type IN ('SELECT','INSERT','UPDATE'))
         AS public_column_allowed,
 EXISTS (SELECT 1 FROM aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
         WHERE a.grantee = 0 AND a.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE'))
         AS public_table_allowed,
 EXISTS (SELECT 1 FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
         WHERE a.grantee<>c.relowner
           AND a.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')
           AND NOT (n.nspname='auth_proof_private' AND c.relname='security_boundary'
             AND a.privilege_type='SELECT'
             AND a.grantee=(SELECT oid FROM pg_roles WHERE rolname=$2::name)))
         AS nonowner_table_allowed,
 EXISTS (SELECT 1 FROM pg_attribute a
         CROSS JOIN LATERAL aclexplode(COALESCE(a.attacl,acldefault('c',c.relowner))) acl
         WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
           AND acl.grantee<>c.relowner
           AND acl.privilege_type IN ('SELECT','INSERT','UPDATE','REFERENCES'))
         AS nonowner_column_allowed
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE left(n.nspname,11) = 'auth_proof_'
  AND c.relkind IN ('r','p')`;

// Enumerate every non-table pg_class kind, including index, composite, sequence,
// view and foreign objects. Only actual indexes of the frozen private tables
// are allowed. This is distinct from ACL_SQL because has_table_privilege on
// a non-table object cannot safely stand in for its owning table's ACL.
export const RELATION_INVENTORY_SQL = `
SELECT n.nspname AS schema_name, c.relname AS relation_name,
 c.relkind AS relation_kind, pg_get_userbyid(c.relowner) AS relation_owner,
 tn.nspname AS parent_schema, t.relname AS parent_table,
 pg_get_userbyid(t.relowner) AS parent_owner
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_index ix ON ix.indexrelid=c.oid
LEFT JOIN pg_class t ON t.oid=ix.indrelid
LEFT JOIN pg_namespace tn ON tn.oid=t.relnamespace
WHERE left(n.nspname,11)='auth_proof_' AND c.relkind NOT IN ('r','p')`;

export const SCHEMA_ACL_SQL = `
WITH target_schemas AS (
 SELECT n.oid,n.nspname,false AS is_pgcrypto_extension
 FROM pg_namespace n
 WHERE left(n.nspname,11) = 'auth_proof_'
 UNION ALL
 SELECT n.oid,n.nspname,true
 FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
 WHERE e.extname='pgcrypto'
), unique_schemas AS (
 SELECT oid,nspname,bool_or(is_pgcrypto_extension) AS is_pgcrypto_extension
 FROM target_schemas GROUP BY oid,nspname
)
SELECT n.nspname AS schema_name, pg_get_userbyid(n.nspowner) AS schema_owner,
 schema_owner.rolsuper AS schema_owner_superuser,
 pg_has_role($1::name,n.nspowner,'MEMBER') AS owner_membership,
 has_schema_privilege($1::name,n.oid,'USAGE') AS runtime_usage,
 has_schema_privilege($1::name,n.oid,'CREATE') AS runtime_create,
 EXISTS(SELECT 1 FROM aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) a
        WHERE a.grantee=0 AND a.privilege_type='USAGE') AS public_usage,
 EXISTS(SELECT 1 FROM aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) a
        WHERE a.grantee=0 AND a.privilege_type='CREATE') AS public_create
	 , EXISTS(SELECT 1 FROM aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) a
        WHERE a.grantee<>n.nspowner AND a.privilege_type='CREATE') AS nonowner_create_allowed,
 EXISTS(SELECT 1 FROM aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) a
        WHERE a.grantee<>n.nspowner AND a.privilege_type='USAGE'
          AND NOT (n.nspname='auth_proof_crypto' AND a.grantee=
            (SELECT oid FROM pg_roles WHERE rolname='vap1_proof_owner'))
          AND NOT (n.nspname='auth_proof_private' AND a.grantee=
            (SELECT oid FROM pg_roles WHERE rolname=$2::name)))
        AS untrusted_schema_usage,
 s.is_pgcrypto_extension,
 pg_get_userbyid(e.extowner) AS extension_owner,
 COALESCE(extension_owner.rolsuper,false) AS extension_owner_superuser
FROM unique_schemas s
JOIN pg_namespace n ON n.oid=s.oid
JOIN pg_roles schema_owner ON schema_owner.oid=n.nspowner
LEFT JOIN pg_extension e ON e.extnamespace=n.oid AND e.extname='pgcrypto'
LEFT JOIN pg_roles extension_owner ON extension_owner.oid=e.extowner
ORDER BY n.nspname`;

export const FUNCTION_ACL_SQL = `
SELECT p.oid::regprocedure::text AS signature,
 p.prokind AS function_kind,
 pg_get_userbyid(p.proowner) AS function_owner,
 pg_has_role($1::name,p.proowner,'MEMBER') AS owner_membership,
 has_function_privilege($1::name, p.oid, 'EXECUTE') AS runtime_execute,
 EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f',p.proowner))) a
         WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS public_execute,
 EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
         WHERE a.grantee<>p.proowner AND a.privilege_type='EXECUTE') AS nonowner_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'auth_proof_private'`;

export const DEFAULT_FUNCTION_ACL_SQL = `
SELECT r.rolname AS default_owner, n.nspname AS default_schema,
 EXISTS (SELECT 1 FROM aclexplode(COALESCE(
   (SELECT d.defaclacl FROM pg_default_acl d
    WHERE d.defaclrole=r.oid AND d.defaclnamespace=0 AND d.defaclobjtype='f'),
   acldefault('f',r.oid))) a
   WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS global_public_execute,
 EXISTS (SELECT 1 FROM aclexplode(COALESCE(
   (SELECT d.defaclacl FROM pg_default_acl d
    WHERE d.defaclrole=r.oid AND d.defaclnamespace=0 AND d.defaclobjtype='f'),
   acldefault('f',r.oid))) a
   WHERE a.grantee<>r.oid AND a.privilege_type='EXECUTE') AS global_nonowner_execute,
 EXISTS (SELECT 1 FROM pg_default_acl d
   CROSS JOIN LATERAL aclexplode(d.defaclacl) a
   WHERE d.defaclrole=r.oid AND d.defaclnamespace=n.oid
     AND d.defaclobjtype='f' AND a.grantee=0
     AND a.privilege_type='EXECUTE') AS schema_public_execute,
 EXISTS (SELECT 1 FROM pg_default_acl d
   CROSS JOIN LATERAL aclexplode(d.defaclacl) a
   WHERE d.defaclrole=r.oid AND d.defaclnamespace=n.oid
     AND d.defaclobjtype='f' AND a.grantee<>r.oid
     AND a.privilege_type='EXECUTE') AS schema_nonowner_execute
FROM pg_roles r JOIN pg_namespace n ON n.nspname='auth_proof_private'
WHERE r.rolname='vap1_proof_owner'`;
