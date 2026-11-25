import { Client } from "pg";

interface RuntimeActivity {
  readonly pid: number;
  readonly state: string | null;
  readonly xact_start: Date | null;
}

// pg_stat_activity.state/query are hidden from different roles. Authenticate
// with the fixture runtime identity and prove that database/role before reading.
export class GuestT3PostgresActivityObserver {
  private readonly client: Client;

  constructor(
    runtimeUrl: string,
    private readonly databaseName: string,
    private readonly runtimeRole: string,
  ) {
    this.client = new Client({
      connectionString: runtimeUrl,
      connectionTimeoutMillis: 2_000,
    });
  }

  async connect(): Promise<void> {
    await this.client.connect();
    const identity = await this.client.query<{
      database_name: string;
      role_name: string;
    }>(
      "SELECT current_database() AS database_name, current_user AS role_name",
    );
    if (
      identity.rows[0]?.database_name !== this.databaseName ||
      identity.rows[0]?.role_name !== this.runtimeRole
    ) {
      throw new Error("Guest T3 activity observer is not the fixture runtime identity.");
    }
    const self = await this.client.query<{ state: string | null }>(
      "SELECT state FROM pg_stat_activity WHERE pid = pg_backend_pid()",
    );
    if (self.rows[0]?.state !== "active") {
      throw new Error("Guest T3 activity observer cannot inspect its own backend state.");
    }
  }

  async active(): Promise<RuntimeActivity[]> {
    const result = await this.client.query<RuntimeActivity>(
      `SELECT pid, state, xact_start FROM pg_stat_activity
       WHERE datname=$1 AND usename=$2 AND pid<>pg_backend_pid()
         AND (state IS NULL OR state='active' OR
              state LIKE '%transaction%' OR xact_start IS NOT NULL)`,
      [this.databaseName, this.runtimeRole],
    );
    return result.rows;
  }

  async end(): Promise<void> {
    await this.client.end();
  }
}
