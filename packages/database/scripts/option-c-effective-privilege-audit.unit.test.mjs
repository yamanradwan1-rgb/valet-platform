import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  auditOptionCEffectivePrivileges, verifyOptionCEffectivePrivileges,
  normalizeOptionCRoles, compareOptionCPrivilegeSnapshots,
  serializeOptionCPrivilegeSnapshot,
} from './option-c-effective-privilege-audit.mjs';
import { catalogQueries } from './option-c-effective-privilege-catalog.mjs';
import { optionCFunctionContract } from './option-c-protected-cutover-acl.mjs';
import { protectedTables } from './option-c-effective-privilege-policy.mjs';

const roles = {
  runtime: 'runtime', staffAuthWriter: 'auth_writer', mfaWriter: 'mfa_writer',
  managementWriter: 'management_writer', migrationRole: 'migrator',
};
const names = { ...roles, sessionLockOwner: 'vaylet_staff_session_lock_owner' };
const roleRows = Object.values(names).map(role => ({ role, login: role !== names.sessionLockOwner,
  superuser: false, create_database: false, create_role: false,
  replication: false, bypass_rls: false }));
const column = (role, object, name, privilege, effective) => ({
  kind: 'column', role, object, column: name, privilege, effective,
  grant_option: false, grants: [],
});
const table = (role, object, privilege, effective = false) => ({
  kind: 'table', role, object, privilege, effective, grant_option: false, grants: [],
});

function matrix() {
  const rows = roleRows.map(row => ({ kind: 'role', ...row }));
  for (const [type, signatures] of Object.entries({
    staffAuthWriter: optionCFunctionContract.staffAuth,
    mfaWriter: optionCFunctionContract.mfa,
    managementWriter: optionCFunctionContract.management,
  })) {
    for (const [index, signature] of signatures.entries()) {
      const search_path = type === 'managementWriter' ||
        (type === 'staffAuthWriter' && index === 0) ? 'pg_catalog, public' : 'pg_catalog';
      for (const role of Object.values(names)) {
        rows.push({ kind: 'function', role, object: signature,
          privilege: 'EXECUTE', effective: role === names[type],
          grant_option: false, owner: 'function_owner', security_definer: true,
          proconfig: [`search_path=${search_path}`], search_path,
          grants: [{ grantee: names[type], grantOption: false }] });
      }
    }
  }
  for (const [object, columns] of Object.entries({
    staff_auth_sessions: ['id', 'user_id', 'revoked_at', 'access_expires_at',
      'absolute_expires_at', 'runtime_lock_version', 'current_access_token_hash',
      'last_admin_activity_at', 'mfa_authenticated_at', 'mfa_factor_id', 'last_rotated_at'],
    users: ['password_hash'],
  })) {
    for (const role of Object.values(names)) {
      for (const name of columns) {
        for (const privilege of ['SELECT', 'UPDATE']) {
          rows.push(column(role, object, name, privilege,
            role === names.sessionLockOwner && object === 'staff_auth_sessions' &&
            ((privilege === 'SELECT' && name !== 'current_access_token_hash' &&
              name !== 'last_admin_activity_at' && name !== 'mfa_authenticated_at' &&
              name !== 'mfa_factor_id' && name !== 'last_rotated_at') ||
              (privilege === 'UPDATE' && name === 'runtime_lock_version'))));
        }
      }
    }
  }
  for (const role of Object.values(names)) {
    for (const object of protectedTables) {
      for (const privilege of ['SELECT', 'UPDATE', 'INSERT', 'DELETE', 'TRUNCATE']) {
        rows.push(table(role, object, privilege));
      }
    }
  }
  return rows;
}

function fixtureClient(evidence = matrix()) {
  const calls = [];
  const client = { async query(sql, params) {
    calls.push({ sql, params });
    const key = Object.entries(catalogQueries).find(([, query]) => query === sql)?.[0];
    assert(key, 'Must execute a real catalog query');
    return { rows: evidence.filter(row => ({ roles: 'role', memberships: 'membership',
      schemas: 'schema', tables: 'table', columns: 'column', sequences: 'sequence',
      functions: 'function', defaults: 'default' })[key] === row.kind) };
  } };
  return { client, calls };
}

test('role names are validated and default session owner is stable', () => {
  assert.deepEqual(normalizeOptionCRoles(roles), names);
  assert.throws(() => normalizeOptionCRoles({ ...roles, mfaWriter: 'runtime' }), /distinct/);
  assert.throws(() => normalizeOptionCRoles({ ...roles, runtime: 'bad;drop' }), /valid roles/);
});

test('audit issues catalog/effective predicate SQL with configured role parameters', async () => {
  const { client, calls } = fixtureClient();
  const snapshot = await auditOptionCEffectivePrivileges(client, roles);
  assert.equal(calls.length, Object.keys(catalogQueries).length);
  assert(calls.filter(call => call.sql !== catalogQueries.defaults)
    .every(call => call.params[0].includes('auth_writer')));
  assert.deepEqual(calls.find(call => call.sql === catalogQueries.defaults).params, []);
  assert.equal(calls.find(call => call.sql === catalogQueries.memberships).params[1],
    names.sessionLockOwner);
  for (const keyword of ['has_table_privilege', 'has_column_privilege',
    'has_sequence_privilege', 'has_function_privilege', 'has_schema_privilege',
    'pg_has_role', 'aclexplode', 'pg_default_acl', 'prosecdef', 'pg_auth_members']) {
    assert(Object.values(catalogQueries).some(sql => sql.includes(keyword)), keyword);
  }
  assert.equal(snapshot.matrix.length, matrix().length);
  assert.deepEqual(snapshot.matrix, [...snapshot.matrix].sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b), 'en')));
});

test('valid bounded matrix verifies, including lock ownership and exact columns', async () => {
  const { client } = fixtureClient();
  const snapshot = await verifyOptionCEffectivePrivileges(client, roles);
  assert.equal(snapshot.roles.runtime, 'runtime');
});

test('catches effective role inheritance, secret reads, PUBLIC EXECUTE and grant options', async () => {
  const evidence = matrix();
  evidence.push({ kind: 'membership', role: 'runtime', object: 'auth_writer',
    member: true, effective_set: true, effective_inherit: true });
  evidence.find(row => row.kind === 'column' && row.role === 'runtime' &&
    row.column === 'current_access_token_hash' && row.privilege === 'SELECT').effective = true;
  evidence.push({ kind: 'function', role: 'runtime', object: 'public.secret()',
    privilege: 'EXECUTE', effective: true, grant_option: false,
    security_definer: true, proconfig: ['search_path=pg_catalog'],
    search_path: 'pg_catalog', grants: [{ grantee: 'PUBLIC' }] });
  evidence.find(row => row.kind === 'table' && row.role === 'runtime').grant_option = true;
  await assert.rejects(verifyOptionCEffectivePrivileges(fixtureClient(evidence).client, roles),
    error => error.failures.some(f => f.includes('membership/SET/INHERIT')) &&
      error.failures.some(f => f.includes('current_access_token_hash')) &&
      error.failures.some(f => f.includes('PUBLIC function')) &&
      error.failures.some(f => f.includes('grant option')));
});

test('snapshots serialize deterministically and diff without secrets', async () => {
  const before = await auditOptionCEffectivePrivileges(fixtureClient().client, roles);
  const after = structuredClone(before);
  after.matrix[0].effective = true;
  const comparison = compareOptionCPrivilegeSnapshots(before, after);
  assert.equal(comparison.changed, true);
  assert.equal(comparison.changes.length, 1);
  assert.equal(serializeOptionCPrivilegeSnapshot(before),
    serializeOptionCPrivilegeSnapshot(structuredClone(before)));
  assert.equal(compareOptionCPrivilegeSnapshots(after, after).changed, false);
});
