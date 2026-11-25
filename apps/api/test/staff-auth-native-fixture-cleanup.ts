import type { INestApplication } from "@nestjs/common";
import { Pool } from "pg";
import {
  dropFixtureCreatedRole,
  restoreFixtureWriterRoles,
  type FixtureWriterRoleSnapshot,
} from "./staff-auth-native-writer-role-lifecycle";
import {
  assertStaffAuthFixtureEndpoints,
  closeStaffAuthFixturePools,
  dropStaffAuthFixtureDatabase,
} from "./staff-auth-native-database-drop";

interface CleanupState {
  readonly app: INestApplication | undefined;
  readonly pool: Pool | undefined;
  readonly adminDatabaseUrl: string;
  readonly databaseCreated: boolean;
  readonly databaseName: string;
  readonly fixtureDatabaseUrl: string;
  readonly databaseOwnerRole?: string;
  readonly runtimeRole?: string;
  readonly writerRoleSnapshots: FixtureWriterRoleSnapshot[];
}

export async function cleanupStaffAuthNativeFixture(
  state: CleanupState,
): Promise<void> {
  // Re-attest even after an interrupted setup; the cleanup must never send
  // DROP/role statements to a server other than this fixture's creator.
  assertStaffAuthFixtureEndpoints(
    state.databaseName,
    state.fixtureDatabaseUrl,
    state.adminDatabaseUrl,
    state.fixtureDatabaseUrl,
    {},
  );
  const errors: unknown[] = [];
  for (const close of [
    state.app === undefined ? undefined : () => state.app!.close(),
    state.pool === undefined ? undefined : () => state.pool!.end(),
  ]) {
    if (!close) continue;
    try {
      await close();
    } catch (error) {
      errors.push(error);
    }
  }
  if (state.databaseCreated) {
    try {
      await closeStaffAuthFixturePools(
        state.databaseName,
        state.fixtureDatabaseUrl,
      );
    } catch (error) {
      errors.push(error);
    }
  }
  const bootstrap = new Pool({
    connectionString: state.adminDatabaseUrl,
    max: 1,
  });
  let databaseDropped = !state.databaseCreated;
  try {
    if (state.databaseCreated) {
      let assumedDatabaseOwner = false;
      try {
        if (state.databaseOwnerRole !== undefined) {
          if (!/^[a-z_][a-z0-9_]{0,62}$/.test(state.databaseOwnerRole)) {
            throw new Error("Fixture database owner role is unsafe.");
          }
          const ownership = await bootstrap.query<{
            owner: string;
            bootstrap: string;
          }>(
            `SELECT pg_catalog.pg_get_userbyid(datdba) AS owner,
                    current_user AS bootstrap
               FROM pg_catalog.pg_database WHERE datname = $1`,
            [state.databaseName],
          );
          const database = ownership.rows[0];
          if (database?.owner === state.databaseOwnerRole) {
            await bootstrap.query(`SET ROLE "${state.databaseOwnerRole}"`);
            assumedDatabaseOwner = true;
          } else if (database && database.owner !== database.bootstrap) {
            throw new Error("Fixture database has an unexpected owner.");
          }
        }
        await dropStaffAuthFixtureDatabase(bootstrap, state.databaseName);
        databaseDropped = true;
        if (state.runtimeRole && assumedDatabaseOwner) {
          await dropFixtureCreatedRole(bootstrap, state.runtimeRole);
        }
      } catch (error) {
        errors.push(error);
      } finally {
        if (assumedDatabaseOwner) {
          try {
            await bootstrap.query("RESET ROLE");
          } catch (error) {
            errors.push(error);
          }
        }
      }
    }
    if (databaseDropped) {
      try {
        await restoreFixtureWriterRoles(bootstrap, state.writerRoleSnapshots);
      } catch (error) {
        errors.push(error);
      }
      if (state.runtimeRole && state.databaseOwnerRole === undefined) {
        try {
          await dropFixtureCreatedRole(bootstrap, state.runtimeRole);
        } catch (error) {
          errors.push(error);
        }
      }
    }
  } finally {
    try {
      await bootstrap.end();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0)
    throw new AggregateError(errors, "Fixture cleanup incomplete.");
}
