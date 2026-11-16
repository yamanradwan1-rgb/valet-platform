import { optionCFunctionContract } from './option-c-protected-cutover-acl.mjs';

export const protectedTables = new Set([
  'staff_auth_sessions', 'staff_refresh_credentials', 'users',
  'user_mfa_totp_factors', 'mfa_recovery_codes', 'anti_abuse_events',
  'organization_memberships', 'locations', 'staff_onboarding_invitations',
  'audit_events', 'membership_location_access',
]);

const writers = ['staffAuthWriter', 'mfaWriter', 'managementWriter'];
const sensitiveUpdates = {
  staff_auth_sessions: ['current_access_token_hash', 'access_expires_at',
    'last_rotated_at', 'mfa_authenticated_at', 'mfa_factor_id',
    'last_admin_activity_at', 'runtime_lock_version'],
  staff_refresh_credentials: ['token_hash', 'consumed_at', 'replaced_by_credential_id'],
  users: ['password_hash', 'last_login_at', 'status'],
  user_mfa_totp_factors: ['secret_ciphertext', 'verified_at', 'disabled_at'],
  mfa_recovery_codes: ['code_hash', 'consumed_at'],
  organization_memberships: ['role', 'status'],
  locations: ['organization_id'],
};
const lockSelect = new Set([
  'id', 'user_id', 'revoked_at', 'access_expires_at',
  'absolute_expires_at', 'runtime_lock_version',
]);
const elevated = ['superuser', 'create_database', 'create_role', 'replication', 'bypass_rls'];
const protectedFunctions = new Map([
  ...optionCFunctionContract.staffAuth.map((name, index) => [name, {
    role: 'staffAuthWriter', path: index === 0 ? 'pg_catalog, public' : 'pg_catalog',
  }]),
  ...optionCFunctionContract.mfa.map(name => [name, { role: 'mfaWriter', path: 'pg_catalog' }]),
  ...optionCFunctionContract.management.map(name => [name, {
    role: 'managementWriter', path: 'pg_catalog, public',
  }]),
]);
const rowKey = (kind, role, object, privilege, column) =>
  `${kind}|${role}|${object}|${privilege}|${column || ''}`;

export function checkOptionCPrivilegeMatrix(matrix, roles) {
  const failures = [];
  const byKey = new Map(matrix.map(row => [
    rowKey(row.kind, row.role, row.object, row.privilege, row.column), row,
  ]));
  const requireDenied = (kind, role, object, privilege, column) => {
    const row = byKey.get(rowKey(kind, role, object, privilege, column));
    if (!row || row.effective !== false) {
      failures.push(`${role}: ${kind} ${object}${column ? '.' + column : ''} ${privilege} must be denied`);
    }
  };
  const requireAllowed = (kind, role, object, privilege, column) => {
    const row = byKey.get(rowKey(kind, role, object, privilege, column));
    if (!row || row.effective !== true) {
      failures.push(`${role}: ${kind} ${object}${column ? '.' + column : ''} ${privilege} must be allowed`);
    }
  };
  const forbidRole = (source, target) => {
    const row = matrix.find(r => r.kind === 'membership' &&
      r.role === source && r.object === target);
    if (row?.member || row?.effective_set || row?.effective_inherit || row?.direct_admin) {
      failures.push(`${source}: membership/SET/INHERIT/ADMIN in ${target}`);
    }
  };
  for (const key of ['runtime', ...writers, 'sessionLockOwner']) {
    const role = roles[key];
    const attributes = matrix.find(r => r.kind === 'role' && r.role === role);
    if (!attributes) {
      failures.push(`Missing role ${role}`);
      continue;
    }
    if (elevated.some(attr => attributes[attr])) failures.push(`${role}: elevated role attributes`);
    for (const other of [...writers, 'sessionLockOwner']) {
      if (other !== key) forbidRole(role, roles[other]);
    }
  }
  const lock = matrix.find(r => r.kind === 'role' && r.role === roles.sessionLockOwner);
  if (lock?.login !== false) failures.push('Session lock owner must be NOLOGIN');
  for (const table of protectedTables) {
    for (const key of ['runtime', ...writers, 'sessionLockOwner']) {
      if (!byKey.has(rowKey('table', roles[key], table, 'SELECT'))) {
        failures.push(`Missing protected table ${table} for ${roles[key]}`);
      }
    }
  }
  if (matrix.some(r => r.kind === 'membership' && r.object === roles.sessionLockOwner &&
      r.member && r.role !== roles.sessionLockOwner)) {
    failures.push('Session lock owner has a parent membership');
  }
  // Also reject memberships held by the NOLOGIN lock role itself.
  if (matrix.some(r => r.kind === 'membership' && r.role === roles.sessionLockOwner && r.member)) {
    failures.push('Session lock owner belongs to another role');
  }

  const session = 'staff_auth_sessions';
  requireDenied('column', roles.runtime, session, 'SELECT', 'current_access_token_hash');
  requireDenied('column', roles.managementWriter, session, 'SELECT', 'current_access_token_hash');
  requireDenied('column', roles.managementWriter, session, 'UPDATE', 'last_admin_activity_at');
  requireDenied('column', roles.mfaWriter, 'users', 'SELECT', 'password_hash');
  requireDenied('table', roles.mfaWriter, 'users', 'SELECT');
  for (const [table, columns] of Object.entries(sensitiveUpdates)) {
    for (const column of columns) {
      if (byKey.has(rowKey('column', roles.runtime, table, 'UPDATE', column))) {
        requireDenied('column', roles.runtime, table, 'UPDATE', column);
      }
    }
  }
  for (const table of ['users', 'organization_memberships', 'locations']) {
    for (const privilege of ['UPDATE', 'INSERT', 'DELETE', 'TRUNCATE']) {
      requireDenied('table', roles.managementWriter, table, privilege);
    }
    for (const row of matrix.filter(r => r.kind === 'column' &&
      r.role === roles.managementWriter && r.object === table &&
      ['UPDATE', 'INSERT'].includes(r.privilege) && r.effective)) {
      failures.push(`Management Writer ${table}.${row.column} ${row.privilege} is unsafe`);
    }
  }
  for (const row of matrix) {
    if (row.kind === 'table' && ['staff_auth_sessions', 'staff_refresh_credentials',
      'user_mfa_totp_factors', 'mfa_recovery_codes', 'anti_abuse_events',
      'organization_memberships', 'locations', 'staff_onboarding_invitations'].includes(row.object) &&
      row.role === roles.runtime && ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'].includes(row.privilege) &&
      row.effective) failures.push(`Runtime table-level ${row.object} ${row.privilege}`);
    if (row.kind === 'column' && row.role === roles.runtime &&
      ['staff_auth_sessions', 'staff_refresh_credentials', 'user_mfa_totp_factors',
        'mfa_recovery_codes', 'anti_abuse_events', 'organization_memberships',
        'locations', 'staff_onboarding_invitations'].includes(row.object) &&
      ['INSERT', 'UPDATE', 'REFERENCES'].includes(row.privilege) &&
      row.effective) failures.push(`Runtime protected column ${row.object}.${row.column} ${row.privilege}`);
    if (row.kind === 'column' && row.role === roles.sessionLockOwner &&
      row.object === session && row.effective &&
      !(row.privilege === 'SELECT' && lockSelect.has(row.column)) &&
      !(row.privilege === 'UPDATE' && row.column === 'runtime_lock_version')) {
      failures.push(`Lock owner unexpected ${row.privilege} ${row.column}`);
    }
    if (row.role === roles.sessionLockOwner && row.kind === 'column' &&
      row.object !== session && row.effective) failures.push(`Lock owner ${row.object}.${row.column}`);
    if (row.role === roles.sessionLockOwner &&
      ['table', 'sequence'].includes(row.kind) && row.effective) {
      failures.push(`Lock owner ${row.kind} ${row.object} ${row.privilege}`);
    }
    if (['table', 'column', 'sequence', 'function', 'schema'].includes(row.kind) &&
      row.role !== roles.migrationRole && row.grant_option) {
      failures.push(`${row.role}: grant option on ${row.kind} ${row.object}`);
    }
    if (['table', 'column', 'sequence', 'function'].includes(row.kind)) {
      const protectedObject = row.kind === 'function' ||
        (row.kind === 'sequence' && /staff_|mfa_|user_|audit_|membership_|location_/.test(row.object)) ||
        protectedTables.has(row.object);
      if (protectedObject && row.grants?.some(g => g.grantee === 'PUBLIC' &&
        (row.kind === 'function' || row.privilege !== 'SELECT' ||
          (row.kind === 'table' && ['staff_auth_sessions', 'users'].includes(row.object)) ||
          (row.kind === 'column' && ['current_access_token_hash', 'password_hash'].includes(row.column))))) {
        failures.push(`PUBLIC ${row.kind} ${row.object} ${row.privilege}`);
      }
    }
    if (row.kind === 'default' &&
      (row.grantee === 'PUBLIC' || row.grant_option ||
        [...writers.map(k => roles[k]), roles.runtime, roles.sessionLockOwner].includes(row.grantee))) {
      failures.push(`Unsafe default ACL ${row.role} ${row.object} ${row.privilege} ${row.grantee}`);
    }
    if (row.kind === 'function' && row.security_definer &&
      (row.proconfig?.some(value => !value.startsWith('search_path=')) ||
        !row.search_path || !row.search_path.startsWith('pg_catalog'))) {
      failures.push(`SECURITY DEFINER ${row.object} unsafe proconfig/search_path`);
    }
  }
  for (const [signature, contract] of protectedFunctions) {
    const rows = matrix.filter(row => row.kind === 'function' && row.object === signature);
    const permitted = roles[contract.role];
    const allowed = rows.find(row => row.role === permitted);
    if (!allowed || !allowed.security_definer || allowed.owner === permitted ||
      allowed.search_path !== contract.path ||
      !Array.isArray(allowed.proconfig) ||
      allowed.proconfig.length !== 1 ||
      allowed.proconfig[0] !== `search_path=${contract.path}` ||
      allowed.effective !== true) {
      failures.push(`Protected function ${signature} owner/configuration/EXECUTE mismatch`);
    }
    for (const row of rows) {
      if (row.role !== permitted && row.role !== roles.migrationRole && row.effective) {
        failures.push(`${row.role} can EXECUTE protected function ${signature}`);
      }
      if (row.grants?.some(grant => grant.grantee !== permitted &&
        grant.grantee !== row.owner && grant.grantee !== roles.migrationRole)) {
        failures.push(`Unexpected EXECUTE grantee on ${signature}`);
      }
    }
  }
  requireAllowed('column', roles.sessionLockOwner, session, 'UPDATE', 'runtime_lock_version');
  for (const column of lockSelect) requireAllowed('column', roles.sessionLockOwner, session, 'SELECT', column);
  return [...new Set(failures)].sort();
}
