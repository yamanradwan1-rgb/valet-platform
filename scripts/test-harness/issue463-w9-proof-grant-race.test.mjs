import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout } from "node:timers";

import {
  repeatConcurrentOwnerGrants,
} from "./issue463-w9-proof-grant-race.mjs";

test("each backend commits its own GRANT before the competing backend returns", async () => {
  let lockOwner = null;
  const waiting = [];
  let nextPid = 7200;
  let commits = 0;
  class FakeClient {
    constructor() {
      this.pid = ++nextPid;
    }
    async connect() {}
    async end() {}
    async query(sql) {
      if (sql.includes("pg_backend_pid()"))
        return { rows: [{ pid: this.pid, principal: "valet" }] };
      if (sql === "BEGIN" || sql.startsWith("SET LOCAL"))
        return { rows: [] };
      if (sql.startsWith("GRANT ")) {
        if (lockOwner === null) {
          lockOwner = this.pid;
          return { rows: [] };
        }
        return new Promise((resolve) => {
          waiting.push({ ownerPid: this.pid, resolve });
        });
      }
      if (sql === "COMMIT" || sql === "ROLLBACK") {
        if (sql === "COMMIT") commits++;
        if (lockOwner === this.pid) {
          const next = waiting.shift();
          lockOwner = next?.ownerPid ?? null;
          next?.resolve({ rows: [] });
        }
        return { rows: [] };
      }
      throw new Error("Unexpected SQL in barrier test.");
    }
  }
  const identity = {
    databaseNames: ["issue463_w9_a_mock", "issue463_w9_b_mock"],
    port: 55555,
    migratorSecret: "mock",
  };
  const deadline = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("GRANT barrier deadlocked")), 2000));
  const result = await Promise.race([
    repeatConcurrentOwnerGrants(identity, 4, () => new FakeClient()),
    deadline,
  ]);
  assert.equal(result.grantCommits, 8);
  assert.equal(commits, 8);
  assert.equal(waiting.length, 0);
});
