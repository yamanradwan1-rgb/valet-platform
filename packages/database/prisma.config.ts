import "dotenv/config";

import { defineConfig } from "prisma/config";

import { parseMigrationDatabaseUrl } from "./scripts/database-connection-policy.mjs";

const migrationDatabase = parseMigrationDatabaseUrl(
  process.env.MIGRATION_DATABASE_URL,
  process.env.NODE_ENV,
);
const testConnectionLimit = process.env.VAYLET_TEST_POSTGRES_CONNECTION_LIMIT;
let datasourceUrl = migrationDatabase.value;
if (process.env.NODE_ENV === "test" && testConnectionLimit !== undefined) {
  if (!/^[1-9][0-9]*$/.test(testConnectionLimit)) {
    throw new Error(
      "Test PostgreSQL connection limit must be a positive integer.",
    );
  }
  const boundedUrl = new URL(datasourceUrl);
  boundedUrl.searchParams.set("connection_limit", testConnectionLimit);
  datasourceUrl = boundedUrl.toString();
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node prisma/seed.mjs",
  },
  datasource: {
    url: datasourceUrl,
  },
});
