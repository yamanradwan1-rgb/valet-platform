import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  fixture, startIssue333Lab, stopIssue333Lab,
} from './dashboard-issue333-lab';

describe('Issue333 W6 migrated child fixture safety', () => {
  beforeAll(startIssue333Lab, 180_000);
  afterAll(stopIssue333Lab, 90_000);

  it('uses a distinct migrated child database with a least-privilege runtime role', async () => {
    const runtime = new Pool({ connectionString: fixture.runtimeDatabaseUrl() });
    try {
      const result = await runtime.query<{
        db: string; owner: string; superuser: boolean;
      }>(`SELECT current_database() AS db,
        pg_get_userbyid(datdba) AS owner,
        (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS superuser
        FROM pg_database WHERE datname=current_database()`);
      expect(result.rows[0]?.db).not.toBe('postgres');
      expect(result.rows[0]).toMatchObject({ owner: 'issue315_owner', superuser: false });
    } finally { await runtime.end(); }
  });
});
