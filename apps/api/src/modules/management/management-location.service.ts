import { randomUUID } from "node:crypto";

import type {
  ManagementLocationCreateRequest,
  ManagementLocationCurrencyCorrectionRequest,
  ManagementLocationLifecycleCommand,
  ManagementLocationLifecycleResponse,
  ManagementLocationTimezoneCorrectionRequest,
  ManagementLocationTimezoneCorrectionResponse,
} from "@valet/contracts";
import { Inject, Injectable } from "@nestjs/common";

import { lockLocationLifecycle } from "../../common/database/location-lifecycle-lock";
import { lockManagementSettingsOrganization } from "../../common/database/management-settings-lock";
import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { recordAdminActivityInTransaction } from "../auth/mfa/mfa-assurance-policy";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { authorizeLocationLifecycle } from "./management-location-authorization";
import { ManagementLocationError } from "./management-location-errors";
import {
  requirePresenceCompanyCreationReady,
  activatePresenceReadyLocation,
} from "./management-location-presence";
import {
  isSupportedLocationCurrency,
  isValidLocationTimezone,
  locationCreateFingerprint,
} from "./management-location-policy";
import { locationLifecycleProjection } from "./management-location-projection";
import {
  correctLocationCurrency,
  correctLocationTimezone,
  createLocation,
  deactivateLocation,
  stopLocationIntake,
  resumeLocationIntake,
} from "./management-location-repository";

type Actor = Awaited<ReturnType<typeof authorizeLocationLifecycle>>;

@Injectable()
export class ManagementLocationService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
  ) {}

  create(
    context: StaffSessionContext,
    organizationId: string,
    request: ManagementLocationCreateRequest,
  ): Promise<ManagementLocationLifecycleResponse> {
    return inPostgresTransaction(this.pool, async (transaction) => {
      await lockManagementSettingsOrganization(
        transaction,
        organizationId,
        "EXCLUSIVE",
      );
      const actor = await authorizeLocationLifecycle(
        transaction,
        context,
        organizationId,
      );
      await requirePresenceCompanyCreationReady(transaction, organizationId);
      if (
        !isValidLocationTimezone(request.timezone) ||
        !isSupportedLocationCurrency(request.currency)
      ) {
        throw new ManagementLocationError("CONFIGURATION_VALUE_INVALID");
      }
      const result = await createLocation(transaction, {
        actorMembershipId: actor.membershipId,
        candidateLocationId: randomUUID(),
        fingerprint: locationCreateFingerprint(request),
        organizationId,
        request,
      });
      const projection = await locationLifecycleProjection(
        transaction,
        organizationId,
        result.locationId,
      );
      await recordAdminActivityInTransaction(transaction, context);
      return projection;
    });
  }

  read(
    context: StaffSessionContext,
    organizationId: string,
    locationId: string,
  ): Promise<ManagementLocationLifecycleResponse> {
    return this.locationTransaction(
      context,
      organizationId,
      locationId,
      "SHARED",
      (transaction) =>
        locationLifecycleProjection(transaction, organizationId, locationId),
    );
  }

  activate(
    context: StaffSessionContext,
    organizationId: string,
    locationId: string,
    command: ManagementLocationLifecycleCommand,
  ) {
    return this.locationMutation(
      context,
      organizationId,
      locationId,
      command,
      activatePresenceReadyLocation,
      true,
    );
  }

  stopIntake(
    context: StaffSessionContext,
    organizationId: string,
    locationId: string,
    command: ManagementLocationLifecycleCommand,
  ) {
    return this.locationMutation(
      context,
      organizationId,
      locationId,
      command,
      stopLocationIntake,
    );
  }

  resumeIntake(
    context: StaffSessionContext,
    organizationId: string,
    locationId: string,
    command: ManagementLocationLifecycleCommand,
  ) {
    return this.locationMutation(
      context,
      organizationId,
      locationId,
      command,
      resumeLocationIntake,
    );
  }

  deactivate(
    context: StaffSessionContext,
    organizationId: string,
    locationId: string,
    command: ManagementLocationLifecycleCommand,
  ) {
    return this.locationMutation(
      context,
      organizationId,
      locationId,
      command,
      deactivateLocation,
    );
  }

  correctCurrency(
    context: StaffSessionContext,
    organizationId: string,
    locationId: string,
    command: ManagementLocationCurrencyCorrectionRequest,
  ) {
    if (!isSupportedLocationCurrency(command.newCurrency)) {
      throw new ManagementLocationError("CONFIGURATION_VALUE_INVALID");
    }
    return this.locationMutation(
      context,
      organizationId,
      locationId,
      command,
      correctLocationCurrency,
      true,
    );
  }

  correctTimezone(
    context: StaffSessionContext,
    organizationId: string,
    locationId: string,
    command: ManagementLocationTimezoneCorrectionRequest,
  ): Promise<ManagementLocationTimezoneCorrectionResponse> {
    if (!isValidLocationTimezone(command.newTimezone)) {
      throw new ManagementLocationError("CONFIGURATION_VALUE_INVALID");
    }
    return this.locationTransaction(
      context,
      organizationId,
      locationId,
      "EXCLUSIVE",
      async (transaction, actor) => {
        const before = await locationLifecycleProjection(
          transaction,
          organizationId,
          locationId,
        );
        await correctLocationTimezone(
          transaction,
          actor.membershipId,
          organizationId,
          locationId,
          command,
        );
        const location = await locationLifecycleProjection(
          transaction,
          organizationId,
          locationId,
        );
        return {
          impact: {
            historicalReportFactsRewritten: false,
            historicalTimestampsRewritten: false,
            newTimezone: location.timezone,
            previousTimezone: before.timezone,
          },
          location,
        };
      },
    );
  }

  private locationMutation<T extends ManagementLocationLifecycleCommand>(
    context: StaffSessionContext,
    organizationId: string,
    locationId: string,
    command: T,
    mutation: (
      transaction: PostgresTransaction,
      actorMembershipId: string,
      organizationId: string,
      locationId: string,
      command: T,
    ) => Promise<unknown>,
    lockSettings = false,
  ): Promise<ManagementLocationLifecycleResponse> {
    return this.locationTransaction(
      context,
      organizationId,
      locationId,
      "EXCLUSIVE",
      async (transaction, actor) => {
        await mutation(
          transaction,
          actor.membershipId,
          organizationId,
          locationId,
          command,
        );
        return locationLifecycleProjection(
          transaction,
          organizationId,
          locationId,
        );
      },
      lockSettings,
    );
  }

  private locationTransaction<T>(
    context: StaffSessionContext,
    organizationId: string,
    locationId: string,
    mode: "EXCLUSIVE" | "SHARED",
    operation: (transaction: PostgresTransaction, actor: Actor) => Promise<T>,
    settingsAlreadyLocked = false,
  ): Promise<T> {
    return inPostgresTransaction(this.pool, async (transaction) => {
      if (settingsAlreadyLocked) {
        await lockManagementSettingsOrganization(
          transaction,
          organizationId,
          "EXCLUSIVE",
        );
      }
      await lockLocationLifecycle(transaction, locationId, mode);
      const actor = await authorizeLocationLifecycle(
        transaction,
        context,
        organizationId,
        locationId,
      );
      const result = await operation(transaction, actor);
      await recordAdminActivityInTransaction(transaction, context);
      return result;
    });
  }
}
