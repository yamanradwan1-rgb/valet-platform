import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  ISSUE463_P2_REVIEWED_SQL_SHA256,
  ISSUE463_SHARED_ROLES,
} from "./issue463-shared-role-policy.mjs";
import { patchPostgresOwnershipQueries } from "./postgres-ownership-hooks.mjs";

const repoSource = new URL(
  "../../packages/database/prisma/migrations/" +
    "20261127000100_issue463_guest_rating_comments_p2/migration.sql",
  import.meta.url,
);
const sourcePath = process.env.ISSUE463_P2_SOURCE_FILE ?? repoSource;
const sourceExists = existsSync(sourcePath);

function fakePg(actualSql) {
  const statements = [];
  const ownershipEvents = [];
  class Client {
    connectionParameters = {
      host: "127.0.0.1", port: 5432, database: "valet",
    };
    async query(sql) {
      statements.push(sql);
      if (sql.startsWith("SELECT EXISTS"))
        return { rows: [{ exists: true }] };
      if (sql.includes("current_user AS migrator")) {
        return { rows: [{
          migrator: "valet", database_owner: "valet",
          migration_can_login: true, migration_superuser: false,
          migration_inherit: false, migration_create_role: true,
          migration_replication: false, migration_bypass_rls: false,
        }] };
      }
      if (sql.includes("rolcanlogin AS")) {
        return { rows: ISSUE463_SHARED_ROLES.map((name, index) => ({
          name, canLogin: index > 1,
          inherit: false, superuser: false,
          createDb: false, createRole: false,
          replication: false, bypassRls: false,
        })) };
      }
      if (sql.includes("membership.inherit_option")) {
        return { rows: ISSUE463_SHARED_ROLES.flatMap((parent, index) => [
          {
            parent, member: "valet", grantor: "valet_ci_bootstrap",
            grantorSuperuser: true,
            inherit: false, set: false, admin: true,
          },
          ...(index < 2 ? [{
            parent, member: "valet", grantor: "valet",
            grantorSuperuser: false,
            inherit: false, set: true, admin: false,
          }] : []),
        ]) };
      }
      if (sql !== actualSql) throw new Error("Unexpected database mutation");
      return { rows: [], rowCount: 0 };
    }
  }
  class Pool extends Client {}
  patchPostgresOwnershipQueries({
    appendEvent: (event) => ownershipEvents.push(event),
    pg: { Client, Pool },
    primaryDatabaseUrl:
      "postgresql://fixture:secret@127.0.0.1:5432/valet",
  });
  return { client: new Client(), statements, ownershipEvents };
}

test("exact W2 P2 source pin admits pre-attested shared roles without ownership claim", {
  skip: sourceExists ? false : "W2 migration not yet integrated into W9 isolated base",
}, async () => {
  const source = readFileSync(sourcePath, "utf8");
  const digest = createHash("sha256")
    .update(source.replace(/\r\n/g, "\n")).digest("hex");
  assert.equal(digest, ISSUE463_P2_REVIEWED_SQL_SHA256);
  const { client, statements, ownershipEvents } = fakePg(source);
  await client.query(source);
  assert.equal(statements[statements.length - 1], source);
  assert.equal(statements.filter((sql) =>
    sql.startsWith("SELECT EXISTS")).length, 4);
  assert.equal(statements.length, 8);
  assert.deepEqual(ownershipEvents, []);

  const tampered = fakePg(source);
  await assert.rejects(async () => tampered.client.query(source + "\n-- mutated"),
    /has no final review pin/);
  assert.deepEqual(tampered.ownershipEvents, []);
  assert.deepEqual(tampered.statements, []);
});
