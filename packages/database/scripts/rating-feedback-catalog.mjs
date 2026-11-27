// Read-only, privileged catalog inspection. Call only inside the existing
// Option C boundary FOR UPDATE transaction; never connect or mutate here.
const objects = [
  "public.guest_rating_comments",
  "public.guest_rating_comment_notice_approvals",
  "public.guest_rating_comment_privacy_commands",
];

export const feedbackCatalogQueries = Object.freeze({
  roles: `SELECT rolname AS name,rolcanlogin AS login,rolinherit AS inherit,
    rolsuper AS superuser,rolcreatedb AS createdb,rolcreaterole AS createrole,
    rolreplication AS replication,rolbypassrls AS bypassrls
    FROM pg_catalog.pg_roles WHERE rolname=ANY($1::text[])`,
  owned: `SELECT owner.rolname AS owner,'function' AS kind,
       (SELECT wanted.signature FROM unnest($2::text[]) wanted(signature)
        WHERE p.oid=pg_catalog.to_regprocedure(wanted.signature)) AS signature
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles owner ON owner.oid=p.proowner
    WHERE owner.rolname=ANY($1::text[])
    UNION ALL SELECT owner.rolname,'relation',NULL::text
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_roles owner ON owner.oid=c.relowner
    WHERE owner.rolname=ANY($1::text[])
    UNION ALL SELECT owner.rolname,'schema',NULL::text
    FROM pg_catalog.pg_namespace n JOIN pg_catalog.pg_roles owner ON owner.oid=n.nspowner
    WHERE owner.rolname=ANY($1::text[])
    UNION ALL SELECT owner.rolname,'type',NULL::text
    FROM pg_catalog.pg_type t JOIN pg_catalog.pg_roles owner ON owner.oid=t.typowner
    WHERE owner.rolname=ANY($1::text[]) AND t.typrelid=0`,
  memberships: `SELECT parent.rolname AS parent,member.rolname AS member,
    grantor.rolname AS grantor,grantor.rolsuper AS grantor_superuser,
    a.inherit_option AS inherit,a.set_option AS set,a.admin_option AS admin
    FROM pg_catalog.pg_auth_members a
    JOIN pg_catalog.pg_roles parent ON parent.oid=a.roleid
    JOIN pg_catalog.pg_roles member ON member.oid=a.member
    JOIN pg_catalog.pg_roles grantor ON grantor.oid=a.grantor
    WHERE parent.rolname=ANY($1::text[]) OR member.rolname=ANY($1::text[])`,
  routines: `SELECT requested.signature,own.rolname AS owner,p.prosecdef,
    p.provolatile,p.proconfig,p.prokind,p.oid::text AS oid
    FROM unnest($1::text[]) requested(signature)
    LEFT JOIN pg_catalog.pg_proc p
      ON p.oid=pg_catalog.to_regprocedure(requested.signature)
    LEFT JOIN pg_catalog.pg_roles own ON own.oid=p.proowner`,
  executors: `SELECT requested.signature,COALESCE(grantee.rolname,'PUBLIC') AS role,
    acl.is_grantable AS grant_option
    FROM unnest($1::text[]) requested(signature)
    LEFT JOIN pg_catalog.pg_proc p
      ON p.oid=pg_catalog.to_regprocedure(requested.signature)
    LEFT JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl,
      pg_catalog.acldefault('f',p.proowner))) acl
      ON acl.privilege_type='EXECUTE'
    LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid=acl.grantee`,
  featureExecutors: `SELECT COALESCE(
      (SELECT requested.signature FROM unnest($2::text[]) requested(signature)
       WHERE p.oid=pg_catalog.to_regprocedure(requested.signature)),
      p.oid::regprocedure::text) AS signature,
    COALESCE(grantee.rolname,'PUBLIC') AS role,
    acl.is_grantable AS grant_option
    FROM pg_catalog.pg_proc p
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl,
      pg_catalog.acldefault('f',p.proowner))) acl
    LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid=acl.grantee
    WHERE acl.privilege_type='EXECUTE' AND (
      acl.grantee IN (SELECT oid FROM pg_catalog.pg_roles
        WHERE rolname=ANY($1::text[]))
      OR (acl.grantee=0 AND p.pronamespace IN
        (SELECT oid FROM pg_catalog.pg_namespace
          WHERE nspname='rating_feedback_private'))
    )`,
  columns: `SELECT r.rolname AS role,
    n.nspname||'.'||c.relname||'|'||a.attname||'|'||priv.privilege AS key
    FROM pg_catalog.pg_roles r
    CROSS JOIN pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
      AND a.attnum>0 AND NOT a.attisdropped
    CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES'))
      priv(privilege)
    WHERE r.rolname=ANY($1::text[]) AND c.relkind IN ('r','p','v','m','f')
      AND n.nspname NOT IN ('pg_catalog','information_schema')
      AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%'
      AND pg_catalog.has_column_privilege(r.oid,c.oid,a.attnum,priv.privilege)`,
  tables: `SELECT r.rolname AS role,n.nspname||'.'||c.relname AS name,
    priv.privilege
    FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),
      ('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) priv(privilege)
    WHERE r.rolname=ANY($1::text[]) AND c.relkind IN ('r','p','v','m','f')
      AND n.nspname NOT IN ('pg_catalog','information_schema')
      AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%'
      AND pg_catalog.has_table_privilege(r.oid,c.oid,priv.privilege)`,
  featureTableOwners: `SELECT expected.name,owner.rolname AS owner
    FROM unnest($1::text[]) expected(name)
    LEFT JOIN pg_catalog.pg_class c
      ON c.oid=pg_catalog.to_regclass(expected.name)
    LEFT JOIN pg_catalog.pg_roles owner ON owner.oid=c.relowner`,
  grants: `SELECT 'table' AS kind,COALESCE(grantee.rolname,'PUBLIC') AS role,
    n.nspname||'.'||c.relname AS relation,NULL::text AS column_name,
    acl.privilege_type AS privilege,acl.is_grantable AS grant_option
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) acl
    LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid=acl.grantee
    WHERE c.oid IN
      (SELECT pg_catalog.to_regclass(t.name) FROM unnest($1::text[]) t(name))
      AND c.relkind IN ('r','p')
    UNION ALL
    SELECT 'column',COALESCE(grantee.rolname,'PUBLIC'),
      n.nspname||'.'||c.relname,a.attname,acl.privilege_type,acl.is_grantable
    FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) acl
    LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid=acl.grantee
    WHERE c.oid IN
      (SELECT pg_catalog.to_regclass(t.name) FROM unnest($1::text[]) t(name))
      AND a.attnum>0 AND NOT a.attisdropped`,
  schemas: `SELECT r.rolname AS role,n.nspname AS schema,
    pg_catalog.has_schema_privilege(r.oid,n.oid,'USAGE') AS usage,
    pg_catalog.has_schema_privilege(r.oid,n.oid,'CREATE') AS create_access
    FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_namespace n
    WHERE r.rolname=ANY($1::text[]) AND
      n.nspname NOT IN ('pg_catalog','information_schema')
      AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%'`,
  databaseAccess: `SELECT r.rolname AS role,
      pg_catalog.has_database_privilege(r.oid,pg_catalog.current_database(),'CREATE')
        AS can_create,
      pg_catalog.has_database_privilege(r.oid,pg_catalog.current_database(),'TEMPORARY')
        AS can_temp,
      EXISTS(SELECT 1 FROM pg_catalog.pg_database d
        WHERE d.datname=pg_catalog.current_database() AND d.datdba=r.oid)
        AS owns_database
    FROM pg_catalog.pg_roles r WHERE r.rolname=ANY($1::text[])`,
  defaults: `SELECT r.rolname AS role,d.defaclobjtype AS kind,
    COALESCE(n.nspname,'*') AS schema,
    CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE grantee.rolname END AS grantee,
    a.privilege_type AS privilege
    FROM pg_catalog.pg_roles r LEFT JOIN pg_catalog.pg_default_acl d
      ON d.defaclrole=r.oid
    LEFT JOIN pg_catalog.pg_namespace n ON n.oid=d.defaclnamespace
    LEFT JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) a ON true
    LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid=a.grantee
    WHERE r.rolname=ANY($1::text[])`,
  guards: `WITH expected AS
    (SELECT unnest($1::text[]) AS relation_name,unnest($2::text[]) AS column_name)
    SELECT expected.relation_name,expected.column_name,
      a.atttypid='pg_catalog.int8'::regtype AS bigint,
      a.attnotnull AS required,pg_catalog.pg_get_expr(def.adbin,def.adrelid) AS default_sql,
      COALESCE((SELECT bool_or(con.convalidated AND
        regexp_replace(pg_catalog.pg_get_constraintdef(con.oid),'[() ]','','g')
          IN ('CHECK'||expected.column_name||'=0',
              'CHECK'||expected.column_name||'=0::bigint'))
        FROM pg_catalog.pg_constraint con
        WHERE con.conrelid=c.oid AND con.contype='c' AND
          a.attnum=ANY(con.conkey)),false) AS zero_checked
    FROM expected LEFT JOIN pg_catalog.pg_class c
      ON c.oid=pg_catalog.to_regclass(expected.relation_name)
    LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
      AND a.attname=expected.column_name AND a.attnum>0 AND NOT a.attisdropped
    LEFT JOIN pg_catalog.pg_attrdef def ON def.adrelid=c.oid AND def.adnum=a.attnum`,
});

export const featureTables=objects;
