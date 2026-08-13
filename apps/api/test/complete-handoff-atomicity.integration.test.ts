import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CompleteHandoffTestContext } from "./complete-handoff-test-context";

const context = new CompleteHandoffTestContext("atomicity");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

async function installFailureTrigger(
  table: "audit_events" | "dispatch_events" | "key_custody_events",
  eventType: string,
) {
  const suffix = table.replaceAll("_", "");
  const functionName = `reject_006g_${suffix}`;
  const triggerName = `reject_006g_${suffix}_trigger`;
  await context.adminPool.query(
    `CREATE FUNCTION ${functionName}() RETURNS trigger
       LANGUAGE plpgsql AS $$
       BEGIN
         IF NEW.event_type::text = '${eventType}' THEN
           RAISE EXCEPTION 'reject VAL-006G history';
         END IF;
         RETURN NEW;
       END;
       $$;
     CREATE TRIGGER ${triggerName}
       BEFORE INSERT ON ${table}
       FOR EACH ROW EXECUTE FUNCTION ${functionName}()`,
  );
  return async () => {
    await context.adminPool.query(
      `DROP TRIGGER IF EXISTS ${triggerName} ON ${table};
       DROP FUNCTION IF EXISTS ${functionName}()`,
    );
  };
}

describe("VAL-006G completion atomicity", () => {
  it.each([
    ["Audit append", "audit_events", "VALET_SESSION_VEHICLE_RELEASED"],
    ["custody RELEASED append", "key_custody_events", "RELEASED"],
    ["Dispatch completion append", "dispatch_events", "COMPLETED"],
  ] as const)(
    "rolls back everything when %s fails",
    async (_label, table, event) => {
      const fixture = await context.prepareStandard("PICKUP_CODE");
      const before = await context.releaseEffects(fixture);
      const removeTrigger = await installFailureTrigger(table, event);
      try {
        await expect(context.complete(fixture)).rejects.toBeInstanceOf(Error);
      } finally {
        await removeTrigger();
      }
      expect(await context.releaseEffects(fixture)).toEqual(before);
    },
  );
});
