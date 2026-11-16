import type { INestApplication } from "@nestjs/common";
import { Pool } from "pg";
import {
  dropFixtureCreatedRole,
  restoreFixtureWriterRoles,
  type FixtureWriterRoleSnapshot,
} from "./staff-auth-native-writer-role-lifecycle";

interface CleanupState {
  readonly app: INestApplication | undefined;
  readonly pool: Pool | undefined;
  readonly adminDatabaseUrl: string;
  readonly databaseCreated: boolean;
  readonly databaseName: string;
  readonly runtimeRole?: string;
  readonly writerRoleSnapshots: FixtureWriterRoleSnapshot[];
}

export async function cleanupStaffAuthNativeFixture(
  state: CleanupState,
): Promise<void> {
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
  const bootstrap = new Pool({ connectionString: state.adminDatabaseUrl });
  let databaseDropped = !state.databaseCreated;
  try {
    if (state.databaseCreated) {
      try {
        await bootstrap.query(
          `DROP DATABASE "${state.databaseName}" WITH (FORCE)`,
        );
        databaseDropped = true;
      } catch (error) {
        errors.push(error);
      }
    }
    if (databaseDropped) {
      try {
        await restoreFixtureWriterRoles(bootstrap, state.writerRoleSnapshots);
      } catch (error) {
        errors.push(error);
      }
      if (state.runtimeRole) {
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
