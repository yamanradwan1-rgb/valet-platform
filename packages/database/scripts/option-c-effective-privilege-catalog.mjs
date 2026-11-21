// Each query inspects live PostgreSQL catalogs, including implicit owner and PUBLIC ACLs.
// These queries deliberately use privilege predicates rather than parsing GRANT SQL.
const roleCross = `WITH requested AS (
  SELECT oid, rolname FROM pg_catalog.pg_roles WHERE rolname = ANY($1::text[])
)`;
const userSchema = `n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%'`;
const relationName = `CASE WHEN n.nspname = 'public' THEN c.relname::text
  ELSE pg_catalog.format('%I.%I', n.nspname, c.relname) END`;

export const catalogQueries = {
  roles: `SELECT r.rolname AS role, r.rolcanlogin AS login, r.rolinherit AS inherit,
    r.rolsuper AS superuser, r.rolcreatedb AS create_database,
    r.rolcreaterole AS create_role, r.rolreplication AS replication,
    r.rolbypassrls AS bypass_rls, database_owner.rolname AS database_owner
    FROM pg_catalog.pg_roles r
    JOIN pg_catalog.pg_database db ON db.datname=pg_catalog.current_database()
    JOIN pg_catalog.pg_roles database_owner ON database_owner.oid=db.datdba
    WHERE r.rolname = ANY($1::text[])`,
  memberships: `${roleCross} SELECT r.rolname AS role, parent.rolname AS object,
    pg_catalog.pg_has_role(r.oid, parent.oid, 'MEMBER') AS member,
    pg_catalog.pg_has_role(r.oid, parent.oid, 'USAGE') AS effective_inherit,
    pg_catalog.pg_has_role(r.oid, parent.oid, 'SET') AS effective_set,
    COALESCE(m.inherit_option, false) AS direct_inherit,
    COALESCE(m.set_option, false) AS direct_set,
    COALESCE(m.admin_option, false) AS direct_admin,
    m.grantor::pg_catalog.regrole::text AS grantor,
    COALESCE((SELECT rolsuper FROM pg_catalog.pg_roles
      WHERE oid=m.grantor),false) AS grantor_superuser
    FROM requested r CROSS JOIN pg_catalog.pg_roles parent
    LEFT JOIN pg_catalog.pg_auth_members m ON m.member = r.oid AND m.roleid = parent.oid
    WHERE parent.oid <> r.oid AND (m.member IS NOT NULL OR
      pg_catalog.pg_has_role(r.oid, parent.oid, 'MEMBER'))
    UNION ALL SELECT child.rolname, target.rolname,
      pg_catalog.pg_has_role(child.oid,target.oid,'MEMBER'),
      pg_catalog.pg_has_role(child.oid,target.oid,'USAGE'),
      pg_catalog.pg_has_role(child.oid,target.oid,'SET'),
      m.inherit_option,m.set_option,m.admin_option,
      m.grantor::pg_catalog.regrole::text,grantor.rolsuper
    FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles child ON child.oid=m.member
    JOIN pg_catalog.pg_roles target ON target.oid=m.roleid
    JOIN pg_catalog.pg_roles grantor ON grantor.oid=m.grantor
    WHERE target.rolname=$2::text AND child.rolname<>ALL($1::text[])`,
  schemas: `${roleCross} SELECT r.rolname AS role, n.nspname AS object,
    p.privilege AS privilege,
    pg_catalog.has_schema_privilege(r.oid, n.oid, p.privilege) AS effective,
    pg_catalog.has_schema_privilege(r.oid, n.oid, p.privilege || ' WITH GRANT OPTION') AS grant_option,
    COALESCE(a.grants, '[]'::jsonb) AS grants
    FROM requested r CROSS JOIN pg_catalog.pg_namespace n
    CROSS JOIN (VALUES ('USAGE'), ('CREATE')) p(privilege)
    LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object(
      'grantee', CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE x.grantee::pg_catalog.regrole::text END,
      'grantor', x.grantor::pg_catalog.regrole::text,
      'grantOption', x.is_grantable) ORDER BY x.grantee,x.grantor) grants
      FROM pg_catalog.aclexplode(COALESCE(n.nspacl, pg_catalog.acldefault('n',n.nspowner))) x
      WHERE x.privilege_type=p.privilege) a ON true
    WHERE ${userSchema}`,
  tables: `${roleCross} SELECT r.rolname AS role, ${relationName} AS object,
    n.nspname AS schema,
    p.privilege AS privilege,
    pg_catalog.has_table_privilege(r.oid,c.oid,p.privilege) AS effective,
    pg_catalog.has_table_privilege(r.oid,c.oid,p.privilege || ' WITH GRANT OPTION') AS grant_option,
    COALESCE(a.grants,'[]'::jsonb) AS grants, owner.rolname AS owner
    FROM requested r CROSS JOIN pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_catalog.pg_roles owner ON owner.oid=c.relowner
    CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),
      ('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(privilege)
    LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object(
      'grantee', CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE x.grantee::pg_catalog.regrole::text END,
      'grantor', x.grantor::pg_catalog.regrole::text,
      'grantOption', x.is_grantable) ORDER BY x.grantee,x.grantor) grants
      FROM pg_catalog.aclexplode(COALESCE(c.relacl,pg_catalog.acldefault('r',c.relowner))) x
      WHERE x.privilege_type=p.privilege) a ON true
    WHERE ${userSchema} AND c.relkind IN ('r','p','v','m','f')`,
  columns: `${roleCross} SELECT r.rolname AS role, ${relationName} AS object,
    n.nspname AS schema,
    att.attname AS column, p.privilege AS privilege,
    pg_catalog.has_column_privilege(r.oid,c.oid,att.attnum,p.privilege) AS effective,
    pg_catalog.has_column_privilege(r.oid,c.oid,att.attnum,p.privilege || ' WITH GRANT OPTION') AS grant_option,
    COALESCE(a.grants,'[]'::jsonb) AS grants
    FROM requested r CROSS JOIN pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_catalog.pg_attribute att ON att.attrelid=c.oid AND att.attnum>0 AND NOT att.attisdropped
    CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(privilege)
    LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object(
      'grantee', CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE x.grantee::pg_catalog.regrole::text END,
      'grantor', x.grantor::pg_catalog.regrole::text,
      'grantOption', x.is_grantable) ORDER BY x.grantee,x.grantor) grants
      FROM pg_catalog.aclexplode(att.attacl) x WHERE x.privilege_type=p.privilege) a ON true
    WHERE ${userSchema} AND c.relkind IN ('r','p','v','m','f')`,
  sequences: `${roleCross} SELECT r.rolname AS role, ${relationName} AS object,
    n.nspname AS schema,
    p.privilege AS privilege,
    pg_catalog.has_sequence_privilege(r.oid,c.oid,p.privilege) AS effective,
    pg_catalog.has_sequence_privilege(r.oid,c.oid,p.privilege || ' WITH GRANT OPTION') AS grant_option,
    COALESCE(a.grants,'[]'::jsonb) AS grants, owner.rolname AS owner
    FROM requested r CROSS JOIN pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_catalog.pg_roles owner ON owner.oid=c.relowner
    CROSS JOIN (VALUES ('USAGE'),('SELECT'),('UPDATE')) p(privilege)
    LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object(
      'grantee', CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE x.grantee::pg_catalog.regrole::text END,
      'grantor', x.grantor::pg_catalog.regrole::text,
      'grantOption', x.is_grantable) ORDER BY x.grantee,x.grantor) grants
      FROM pg_catalog.aclexplode(COALESCE(c.relacl,pg_catalog.acldefault('S',c.relowner))) x
      WHERE x.privilege_type=p.privilege) a ON true
    WHERE ${userSchema} AND c.relkind='S'`,
  functions: `${roleCross} SELECT r.rolname AS role,
    pg_catalog.format('%I.%I(%s)', n.nspname, p.proname,
      (SELECT string_agg(CASE WHEN tn.nspname='public'
        THEN 'public.' || pg_catalog.quote_ident(t.typname)
        ELSE pg_catalog.format_type(t.oid,NULL) END, ',' ORDER BY a.ordinality)
       FROM unnest(p.proargtypes::oid[]) WITH ORDINALITY a(typeoid, ordinality)
       JOIN pg_catalog.pg_type t ON t.oid=a.typeoid
       JOIN pg_catalog.pg_namespace tn ON tn.oid=t.typnamespace)) AS object,
    pg_catalog.has_function_privilege(r.oid,p.oid,'EXECUTE') AS effective,
    pg_catalog.has_function_privilege(r.oid,p.oid,'EXECUTE WITH GRANT OPTION') AS grant_option,
    owner.rolname AS owner, p.prosecdef AS security_definer,
    ARRAY(SELECT CASE WHEN v LIKE 'search_path=%'
      OR v IN ('lock_timeout=200ms','statement_timeout=500ms') THEN v
      ELSE split_part(v,'=',1) || '=<redacted>' END
      FROM unnest(p.proconfig) v ORDER BY v) AS proconfig,
    (SELECT substring(v FROM 13) FROM unnest(p.proconfig) v WHERE v LIKE 'search_path=%' LIMIT 1) AS search_path,
    COALESCE(a.grants,'[]'::jsonb) AS grants, 'EXECUTE' AS privilege
    FROM requested r CROSS JOIN pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    JOIN pg_catalog.pg_roles owner ON owner.oid=p.proowner
    LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object(
      'grantee', CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE x.grantee::pg_catalog.regrole::text END,
      'grantor', x.grantor::pg_catalog.regrole::text,
      'grantOption', x.is_grantable) ORDER BY x.grantee,x.grantor) grants
      FROM pg_catalog.aclexplode(COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) x
      WHERE x.privilege_type='EXECUTE') a ON true
    WHERE ${userSchema}`,
  defaults: `SELECT owner.rolname AS role, COALESCE(n.nspname,'*') AS object,
    d.defaclobjtype AS object_type,
    CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE x.grantee::pg_catalog.regrole::text END AS grantee,
    x.grantor::pg_catalog.regrole::text AS grantor,
    x.privilege_type AS privilege, x.is_grantable AS grant_option
    FROM pg_catalog.pg_default_acl d
    JOIN pg_catalog.pg_roles owner ON owner.oid=d.defaclrole
    LEFT JOIN pg_catalog.pg_namespace n ON n.oid=d.defaclnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) x
    WHERE d.defaclnamespace=0 OR (${userSchema})`,
};
