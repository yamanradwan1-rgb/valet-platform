import "dotenv/config";

import { defineConfig } from "prisma/config";

const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;
if (migrationDatabaseUrl === undefined || migrationDatabaseUrl.trim() === "") {
  throw new Error("Prisma migration commands require MIGRATION_DATABASE_URL.");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node prisma/seed.mjs",
  },
  datasource: {
    url: migrationDatabaseUrl,
  },
});
