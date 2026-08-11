# Production Database Deployment Checklist

Status: Deployment evidence template
Decision: DEC-025

This provider-neutral checklist separates repository-enforced behavior from
controls that must be verified in the actual production environment. An empty
checkbox is not evidence that a provider control exists.

## Repository enforced

- [ ] Production API uses query-free `DATABASE_URL`; URL credentials and target
  components pass validation.
- [ ] Production API constructs Node `pg` TLS with `rejectUnauthorized: true`.
- [ ] A configured `DATABASE_TLS_CA_PEM` is valid CA PEM material and is supplied
  only through secret management; otherwise system trusted roots validate the
  server.
- [ ] Production startup's live backend reports accepted TLS through
  `pg_stat_ssl`.
- [ ] Production startup verifies the runtime role is not superuser, CREATEDB,
  CREATEROLE, REPLICATION, or BYPASSRLS capable.
- [ ] Production startup verifies the runtime role owns neither the current
  database nor public schema, has no database/schema `CREATE`, and owns no
  public application table, sequence, or function.
- [ ] API process environment does not contain `MIGRATION_DATABASE_URL`.
- [ ] Production migration URL has exact `sslmode=require` and
  `sslaccept=strict`, with only optional `sslrootcert` beyond those keys; when
  present, it is a URL-encoded deployment-mounted absolute path available with
  identical semantics to the Node preflight and Prisma migration process.
- [ ] Production migration/provisioning preflight verifies its own encrypted
  backend before mutation.
- [ ] Runtime and migration identities and their production passwords are
  distinct.

Repository verification evidence:

```text
Release/commit:
CI run:
Runtime preflight result:
Migration preflight result:
Verified by/date:
```

## Deployment verified

### Network boundary

- [ ] PostgreSQL is not generally reachable from the public internet.
- [ ] Runtime database access is restricted to the application deployment
  network/identity boundary.
- [ ] Migration/admin access is restricted to the controlled deployment or
  migration boundary.
- [ ] Proxy, firewall, private-network, security-group, or allowlist evidence is
  attached without selecting a provider in repository policy.

### Secret storage and rotation

- [ ] Runtime database credential is stored in the production secret boundary;
  owner and retrieval scope are recorded.
- [ ] Migration/admin credential is stored separately and is unavailable to the
  API runtime process.
- [ ] Runtime credential rotation owner, procedure, last test, and next review
  are recorded.
- [ ] Migration credential rotation owner, procedure, last test, and next review
  are recorded.
- [ ] If a custom CA is used, CA/certificate rotation owner, procedure, expiry
  monitoring, last test, and next review are recorded.

### Backup and restore

- [ ] Production backups are encrypted; backup owner and access boundary are
  recorded.
- [ ] Restore procedure owner is recorded.
- [ ] Restore procedure has been tested against the intended recovery target;
  date, result, recovery time, and follow-up actions are attached.

Deployment evidence:

```text
Environment:
Network evidence reference:
Secret-storage evidence reference:
Runtime credential rotation owner/procedure:
Migration credential rotation owner/procedure:
CA rotation owner/procedure (if applicable):
Encrypted backup owner/evidence:
Restore owner/test date/result:
Approved by/date:
```

## Closure rule

VAL-004N repository checks do not make these deployment-owned controls true.
Phase 2 production readiness remains blocked until the deployment section has
real evidence and the final Phase 2 closure/security-integrity review is
complete.
