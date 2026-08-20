import type { Pool } from "pg";
import { expect } from "vitest";

export async function expectRefundInsertAuthority(
  adminPool: Pool,
  runtimeRole: string,
): Promise<void> {
  expect(
    await adminPool.query(
      `SELECT has_table_privilege($1, 'public.refunds', 'INSERT') AS broad`,
      [runtimeRole],
    ),
  ).toMatchObject({ rows: [{ broad: false }] });
  const columns = await adminPool.query(
    `SELECT column_name,
            has_column_privilege($1, 'public.refunds', column_name, 'INSERT')
              AS allowed
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'refunds'
     ORDER BY ordinal_position`,
    [runtimeRole],
  );
  expect(
    columns.rows.find((row) => row.column_name === "created_at"),
  ).toMatchObject({ allowed: false });
  expect(
    columns.rows.find((row) => row.column_name === "provider_reference"),
  ).toMatchObject({ allowed: false });
  const table = await adminPool.query(
    `SELECT privilege,
            has_table_privilege($1, 'public.refunds', privilege) AS allowed
     FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE',
                       'REFERENCES','TRIGGER']) privilege
     ORDER BY privilege`,
    [runtimeRole],
  );
  expect(table.rows).toEqual([
    { allowed: false, privilege: "DELETE" },
    { allowed: false, privilege: "INSERT" },
    { allowed: false, privilege: "REFERENCES" },
    { allowed: true, privilege: "SELECT" },
    { allowed: false, privilege: "TRIGGER" },
    { allowed: false, privilege: "TRUNCATE" },
    { allowed: false, privilege: "UPDATE" },
  ]);
}
