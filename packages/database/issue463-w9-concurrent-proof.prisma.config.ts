/** Isolated, owner-attested Issue463 W9 verification only.
 * The W2 committed schema/migrations are read from a separate Git worktree.
 * No production datasource or source mutation is accepted. */
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

const root = process.env.ISSUE463_W9_PROOF_ROOT;
const migrationUrl = process.env.MIGRATION_DATABASE_URL;
if (process.env.NODE_ENV !== "test" ||
    typeof root !== "string" || !isAbsolute(root) ||
    resolve(root) !== resolve(fileURLToPath(new URL("../..", import.meta.url))) ||
    typeof migrationUrl !== "string") {
  throw new Error("Issue463 W9 proof requires an isolated pinned test worktree.");
}

const url = new URL(migrationUrl);
if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" ||
    url.username !== "valet" || url.password.length < 16 ||
    !/^issue463_w9_[ab]_[a-f0-9]{12}$/.test(url.pathname.slice(1)) ||
    !/^[1-9][0-9]{3,4}$/.test(url.port) || url.search !== "") {
  throw new Error("Issue463 W9 proof target is not an attested loopback fixture.");
}

const schema = join(root, "packages/database/prisma/schema.prisma");
const migrationDir = join(root, "packages/database/prisma/migrations");
if (!existsSync(schema) || !existsSync(migrationDir))
  throw new Error("Issue463 W9 committed migration inputs are missing.");

export default defineConfig({
  schema,
  migrations: { path: migrationDir },
  datasource: { url: migrationUrl },
});
