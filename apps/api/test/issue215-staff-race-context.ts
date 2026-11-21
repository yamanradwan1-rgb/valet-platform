import { Pool } from "pg";
import { openIssue215HttpDatabase } from "./issue215-http-fixture-database";

export interface Scope {
  readonly orgId: string;
  readonly locationId: string;
  readonly memberId: string;
  readonly sessionId: string;
  readonly userId: string;
}

export interface RaceContext {
  readonly pool: Pool;
  readonly runtime: Pool;
  readonly authWriter: Pool;
  stop(): Promise<void>;
  seed(): Promise<Scope>;
}

export async function openIssue215StaffRaceContext(): Promise<RaceContext> {
  const database = await openIssue215HttpDatabase();
  const runtime = new Pool({ connectionString: database.runtimeUrl });
  const authWriter = new Pool({
    connectionString: database.writerEnvironment.STAFF_AUTH_WRITER_DATABASE_URL,
  });
  return {
    pool: database.admin,
    runtime,
    authWriter,
    seed: () => database.seed(),
    async stop() {
      const results = await Promise.allSettled([runtime.end(), authWriter.end()]);
      await database.close();
      for (const result of results) {
        if (result.status === "rejected") throw result.reason;
      }
    },
  };
}
