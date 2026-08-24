import { describe, expect, it } from "vitest";

import { purgeStaffAuthAndAntiAbuseState } from "../../tools/local-dev/local-auth-state-reset";
import type { QueryableClient } from "../../tools/local-dev/demo-employee-credential";

class ScriptedClient implements QueryableClient {
  public queries: string[] = [];

  constructor(private readonly failOn?: string) {}

  async query(
    text: string,
  ): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }> {
    this.queries.push(text);
    if (this.failOn !== undefined && text.startsWith(this.failOn)) {
      throw new Error("simulated database failure");
    }
    return { rows: [], rowCount: 7 };
  }
}

describe("staff auth and anti-abuse state purge", () => {
  it("deletes refresh credentials before sessions and anti-abuse events in one transaction", async () => {
    const client = new ScriptedClient();
    const counts = await purgeStaffAuthAndAntiAbuseState(client);
    expect(client.queries).toEqual([
      "BEGIN",
      "DELETE FROM staff_refresh_credentials",
      "DELETE FROM staff_auth_sessions",
      "DELETE FROM anti_abuse_events",
      "COMMIT",
    ]);
    expect(counts).toEqual({
      antiAbuseEventsDeleted: 7,
      refreshCredentialsDeleted: 7,
      staffSessionsDeleted: 7,
    });
  });

  it("rolls back and rethrows without committing on failure", async () => {
    const client = new ScriptedClient("DELETE FROM anti_abuse_events");
    await expect(purgeStaffAuthAndAntiAbuseState(client)).rejects.toThrow(
      "simulated database failure",
    );
    expect(client.queries[0]).toBe("BEGIN");
    expect(client.queries.at(-1)).toBe("ROLLBACK");
    expect(client.queries).not.toContain("COMMIT");
  });

  it("touches only auth session, refresh credential and anti-abuse tables", async () => {
    const client = new ScriptedClient();
    await purgeStaffAuthAndAntiAbuseState(client);
    const touchedTables = client.queries
      .filter((text) => text.startsWith("DELETE FROM"))
      .map((text) => text.replace("DELETE FROM ", ""));
    expect(touchedTables).toEqual([
      "staff_refresh_credentials",
      "staff_auth_sessions",
      "anti_abuse_events",
    ]);
  });
});
