import { randomUUID } from "node:crypto";

import { createRouteHistoryQuery } from "../src/modules/tracking/route-history-query";
import { createStartShiftCommandExecutor } from "../src/modules/shifts/start-shift-command";
import { expect } from "vitest";
import type { TestRole } from "./shift-test-context";
import {
  GpsIngestionTestContext,
  type TrackingFixture,
} from "./gps-ingestion-test-context";

export class RouteHistoryTestContext extends GpsIngestionTestContext {
  constructor(label: string) {
    super(`007f_${label}`);
  }

  async endTracker(fixture: TrackingFixture): Promise<void> {
    await this.adminPool.query(
      `UPDATE task_tracking_sessions SET ended_at = transaction_timestamp()
       WHERE id = $1`,
      [fixture.trackingSessionId],
    );
  }

  async createActor(
    fixture: TrackingFixture,
    role: TestRole,
    options: { access?: boolean; activeShift?: boolean; locationId?: string } = {},
  ): Promise<{ membershipId: string; userId: string }> {
    const userId = randomUUID();
    const membershipId = randomUUID();
    const locationId = options.locationId ?? fixture.locationId;
    await this.adminPool.query(
      `INSERT INTO users (id, email, password_hash, status, updated_at)
       VALUES ($1, $2, 'not-a-password', 'ACTIVE', transaction_timestamp())`,
      [userId, `${userId}@route.test`],
    );
    await this.adminPool.query(
      `INSERT INTO organization_memberships
         (id, organization_id, user_id, role, status, updated_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', transaction_timestamp())`,
      [membershipId, fixture.organizationId, userId, role],
    );
    if (options.access !== false) {
      await this.adminPool.query(
        `INSERT INTO membership_location_access
           (organization_id, membership_id, location_id)
         VALUES ($1, $2, $3)`,
        [fixture.organizationId, membershipId, locationId],
      );
    }
    if (options.activeShift === true) {
      await createStartShiftCommandExecutor(this.runtimePool)({
        authenticatedUserId: userId,
        targetLocationId: locationId,
      });
    }
    return { membershipId, userId };
  }

  async createLocation(fixture: TrackingFixture): Promise<string> {
    const locationId = randomUUID();
    await this.adminPool.query(
      `INSERT INTO locations
         (id, organization_id, name, code, address_text, timezone, currency,
          status, accepting_intake, updated_at)
       VALUES ($1, $2, 'Other route location', $3, 'Address', 'Asia/Amman',
               'JOD', 'ACTIVE', TRUE, transaction_timestamp())`,
      [locationId, fixture.organizationId, randomUUID()],
    );
    return locationId;
  }

  query(input: {
    authenticatedUserId: string;
    cursor?: string;
    limit?: number;
    trackingSessionId: string;
  }) {
    return createRouteHistoryQuery(this.runtimePool)({
      authenticatedUserId: input.authenticatedUserId,
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      limit: input.limit ?? 100,
      trackingSessionId: input.trackingSessionId,
    });
  }
}

export async function expectRouteDenied(operation: Promise<unknown>) {
  await expect(operation).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
}
