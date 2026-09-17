import { randomUUID } from "node:crypto";

import { expect } from "vitest";

import type { MembershipRole } from "../src/modules/staff/custody-staff-authorizer";
import type { IntakeSessionCommandRequest } from "../src/modules/valet-sessions/intake-session-command";
import { useIntakeCommandDatabase } from "./intake-command-database-test-harness";

export interface IntakeFixture {
  locationId: string;
  membershipId: string;
  organizationId: string;
  userId: string;
}

export interface IntakeFixtureOptions {
  locationAccess?: boolean;
  membershipStatus?: "ACTIVE" | "INACTIVE";
  role?: MembershipRole;
  userStatus?: "ACTIVE" | "DISABLED";
}

export interface IntakeScopeCounts {
  audits: number;
  customers: number;
  intakeOperations: number;
  sessions: number;
  vehicles: number;
}

export function useIntakeSessionCommandTestHarness() {
  const database = useIntakeCommandDatabase();

  async function createFixture(
    options: IntakeFixtureOptions = {},
  ): Promise<IntakeFixture> {
    const fixture = {
      locationId: randomUUID(),
      membershipId: randomUUID(),
      organizationId: randomUUID(),
      userId: randomUUID(),
    };
    const identity = randomUUID();
    await database.adminPool.query(
      `INSERT INTO organizations
         (id, name, status, timezone, updated_at)
       VALUES ($1, $2, 'ACTIVE', 'Asia/Amman', transaction_timestamp())`,
      [fixture.organizationId, `VAL-004E ${identity}`],
    );
    await database.adminPool.query(
      `INSERT INTO locations
         (id, organization_id, name, code, address_text, timezone, currency,
          status, accepting_intake, updated_at)
       VALUES ($1, $2, 'Intake location', $3, 'Test address', 'Asia/Amman',
               'JOD', 'ACTIVE', TRUE, transaction_timestamp())`,
      [fixture.locationId, fixture.organizationId, identity],
    );
    await database.adminPool.query(
      `INSERT INTO users
         (id, email, password_hash, status, updated_at)
       VALUES ($1, $2, 'not-a-real-password-hash', $3,
               transaction_timestamp())`,
      [
        fixture.userId,
        `${identity}@val-004e.test`,
        options.userStatus ?? "ACTIVE",
      ],
    );
    await database.adminPool.query(
      `INSERT INTO organization_memberships
         (id, organization_id, user_id, role, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, transaction_timestamp())`,
      [
        fixture.membershipId,
        fixture.organizationId,
        fixture.userId,
        options.role ?? "VALET_EMPLOYEE",
        options.membershipStatus ?? "ACTIVE",
      ],
    );
    if (options.locationAccess !== false) {
      await database.adminPool.query(
        `INSERT INTO membership_location_access
           (organization_id, membership_id, location_id)
         VALUES ($1, $2, $3)`,
        [fixture.organizationId, fixture.membershipId, fixture.locationId],
      );
    }
    return fixture;
  }

  function temporaryRequest(
    fixture: IntakeFixture,
    overrides: Partial<IntakeSessionCommandRequest> = {},
  ): IntakeSessionCommandRequest {
    return {
      authenticatedUserId: fixture.userId,
      intakeOperationId: `intake:${randomUUID()}`,
      targetLocationId: fixture.locationId,
      vehicleIdentity: {
        mode: "TEMPORARY_DESCRIPTOR",
        temporaryDescriptor: `Temporary vehicle ${randomUUID()}`,
      },
      ...overrides,
    };
  }

  function confirmedRequest(
    fixture: IntakeFixture,
    operationId = `intake:${randomUUID()}`,
  ): IntakeSessionCommandRequest {
    return {
      authenticatedUserId: fixture.userId,
      intakeOperationId: operationId,
      targetLocationId: fixture.locationId,
      vehicleIdentity: {
        confirmedByHuman: true,
        mode: "CONFIRMED_PLATE",
        plateCountry: "jo",
        plateNumberRaw: "  ab-１２３  ",
      },
    };
  }

  async function expectCommandError(
    operation: Promise<unknown>,
    code: string,
  ): Promise<Error & { code: string }> {
    try {
      await operation;
      throw new Error(`Expected intake command error ${code}.`);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      const commandError = error as Error & { code: string };
      expect(commandError.code).toBe(code);
      return commandError;
    }
  }

  async function readCounts(
    organizationId: string,
  ): Promise<IntakeScopeCounts> {
    const result = await database.adminPool.query<IntakeScopeCounts>(
      `SELECT
         (SELECT count(*)::integer FROM audit_events
          WHERE organization_id = $1) AS audits,
         (SELECT count(*)::integer FROM customers
          WHERE organization_id = $1) AS customers,
         (SELECT count(*)::integer FROM intake_operations
          WHERE organization_id = $1) AS "intakeOperations",
         (SELECT count(*)::integer FROM valet_sessions
          WHERE organization_id = $1) AS sessions,
         (SELECT count(*)::integer FROM vehicles
          WHERE organization_id = $1) AS vehicles`,
      [organizationId],
    );
    return result.rows[0]!;
  }

  async function completeSession(
    fixture: IntakeFixture,
    sessionId: string,
  ): Promise<void> {
    await database.adminPool.query(
      `UPDATE valet_sessions
       SET state = 'COMPLETED', completed_at = transaction_timestamp(),
           completed_by_membership_id = $2,
           updated_at = transaction_timestamp()
       WHERE id = $1`,
      [sessionId, fixture.membershipId],
    );
  }

  return {
    get adminPool() {
      return database.adminPool;
    },
    completeSession,
    confirmedRequest,
    createFixture,
    expectCommandError,
    readCounts,
    get runtimePool() {
      return database.runtimePool;
    },
    temporaryRequest,
  };
}

export type IntakeSessionCommandTestHarness = ReturnType<
  typeof useIntakeSessionCommandTestHarness
>;
