import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { classifyPackageTests } from "./test-classification.mjs";

test("diagnostic trace names cannot move PostgreSQL fixtures into race lane", () => {
  const root = mkdtempSync(join(tmpdir(), "vaylet-fixture-lane-stability-"));
  const shiftFixture = join(root, "shift-test-context.ts");
  const compoundFixture = join(root, "dashboard-api-test-context.ts");
  const shiftSource =
    'import { Pool } from "pg";\nexport const pool = new Pool();\n';
  const compoundSource =
    'import { Pool } from "pg";\nexport const compoundPool = new Pool();\n';
  try {
    writeFileSync(shiftFixture, shiftSource);
    writeFileSync(compoundFixture, compoundSource);
    writeFileSync(
      join(root, "standard.test.ts"),
      'import { pool } from "./shift-test-context";\nvoid pool;\n',
    );
    writeFileSync(
      join(root, "compound.test.ts"),
      'import { compoundPool } from "./dashboard-api-test-context";\nvoid compoundPool;\n',
    );
    const before = classifyPackageTests({ packageKind: "api", rootDir: root });
    assert.deepEqual(before["api-postgres-standard"], ["standard.test.ts"]);
    assert.deepEqual(before["api-postgres-compound"], ["compound.test.ts"]);
    assert.equal(before["api-postgres-race"], undefined);

    writeFileSync(
      shiftFixture,
      shiftSource + 'export const timingTraceId = "diagnostic trace";\n',
    );
    writeFileSync(
      compoundFixture,
      compoundSource + 'export const traceLabel = "diagnostic trace";\n',
    );
    const after = classifyPackageTests({ packageKind: "api", rootDir: root });
    assert.deepEqual(after, before);

    writeFileSync(
      join(root, "explicit-race.test.ts"),
      'import { pool } from "./shift-test-context";\n' +
        'await Promise.all([pool.query("SELECT 1"), pool.query("SELECT 1")]);\n',
    );
    const actual = classifyPackageTests({ packageKind: "api", rootDir: root });
    assert.deepEqual(actual["api-postgres-race"], ["explicit-race.test.ts"]);
    assert.deepEqual(actual["api-postgres-standard"], ["standard.test.ts"]);
    assert.deepEqual(actual["api-postgres-compound"], ["compound.test.ts"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
