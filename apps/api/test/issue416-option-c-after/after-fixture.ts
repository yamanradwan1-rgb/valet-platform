import { OptionCT5Fixture } from "../issue416-option-c-t5/probe-fixture";
import { assertOwnedOptionCAfterPg17 } from "../issue416-option-c-t5/owned-target";

// AFTER tests use a second, named owner-only cluster. BEFORE .probe.ts suites
// retain their separate original target, opt-in switch and failing assertions.
export class OptionCAfterFixture extends OptionCT5Fixture {
  constructor() {
    super(assertOwnedOptionCAfterPg17);
  }
}

export async function assertRuntimeDeny(
  fixture: OptionCAfterFixture,
  sql: string,
  values: unknown[] = [],
  retiredFunctionSignature?: string,
): Promise<void> {
  const outcome = await fixture.runtimeSql(sql, values);
  if (outcome.allowed) {
    throw new Error(
      "Option C AFTER runtime SQL mutation unexpectedly succeeded.",
    );
  }
  if (outcome.sqlstate === "42501") return;
  if (outcome.sqlstate === "42883" && retiredFunctionSignature !== undefined) {
    const identity = await fixture.runtimeSql(
      `SELECT to_regprocedure($1) IS NULL AS absent`,
      [retiredFunctionSignature],
    );
    if (identity.allowed && identity.result?.absent === true) return;
  }
  throw new Error(
    `Option C AFTER expected privilege denial, received ${outcome.sqlstate}.`,
  );
}

export async function runtimeBoolean(
  fixture: OptionCAfterFixture,
  sql: string,
  values: unknown[],
): Promise<boolean> {
  const result = await fixture.runtimeSql(sql, values);
  if (!result.allowed || typeof result.result?.allowed !== "boolean") {
    throw new Error(
      "Option C AFTER permission query did not return a boolean.",
    );
  }
  return result.result.allowed;
}
