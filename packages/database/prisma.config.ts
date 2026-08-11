import "dotenv/config";

import { defineConfig } from "prisma/config";

import { parseMigrationDatabaseUrl } from "./scripts/database-connection-policy.mjs";

const migrationDatabase = parseMigrationDatabaseUrl(
  process.env.MIGRATION_DATABASE_URL,
  process.env.NODE_ENV,
);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node prisma/seed.mjs",
  },
  datasource: {
    url: migrationDatabase.value,
  },
});
