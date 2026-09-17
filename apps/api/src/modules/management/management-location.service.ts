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
import type { PostgresPool, PostgresTransaction } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { recordAdminActivityInTransaction } from "../auth/mfa/mfa-assurance-policy";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { authorizeCompanyAdminManagement } from "./management-authorization";
import { ManagementLocationError } from "./management-location-errors";
import {
  isSupportedLocationCurrency,
  isValidLocationTimezone,
  locationCreateFingerprint,
} from "./management-location-policy";
import { locationLifecycleProjection } from "./management-location-projection";
import {
  activateLocation,
  correctLocationCurrency,
  correctLocationTimezone,
  createLocation,
  deactivateLocation,
  stopLocationIntake,
} from "./management-location-repository";

type Actor = Awaited<ReturnType<typeof authorizeCompanyAdminManagement>>;

@Injectable()
export class ManagementLocationService {
  constructor(@Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool) {}

  create(
    context: StaffSessionContext,
    organizationId: string,
    request: ManagementLocationCreateRequest,
  ): Promise<ManagementLocationLifecycleResponse> {
    return inPostgresTransaction(this.pool, async (transaction) => {
      const actor = await this.authorize(transaction, context, organizationId);
      if (!isValidLocationTimezone(request.timezone) ||
          !isSupportedLocationCurrency(request.currency)) {
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
        transaction, organizationId, result.locationId,
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
    return this.locationTransaction(context, organizationId, locationId, "SHARED",
      (transaction) => locationLifecycleProjection(transaction, organizationId, locationId));
  }

  activate(
    context: StaffSessionContext,
    organizationId: string,
    locationId: string,
    command: ManagementLocationLifecycleCommand,
  ) {
    return this.locationMutation(context, organizationId, locationId, command,
      activateLocation);
  }

  stopIntake(
    context: StaffSessionContext,
    organizationId: string,
    locationId: string,
    command: ManagementLocationLifecycleCommand,
  ) {
    return this.locationMutation(context, organizationId, locationId, command,
      stopLocationIntake);
  }

  deactivate(
    context: StaffSessionContext,
    organizationId: string,
    locationId: string,
    command: ManagementLocationLifecycleCommand,
  ) {
    return this.locationMutation(context, organizationId, locationId, command,
      deactivateLocation);
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
    return this.locationMutation(context, organizationId, locationId, command,
      correctLocationCurrency, true);
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
    return this.locationTransaction(context, organizationId, locationId, "EXCLUSIVE",
      async (transaction, actor) => {
        const before = await locationLifecycleProjection(transaction, organizationId, locationId);
        await correctLocationTimezone(transaction, actor.membershipId,
          organizationId, locationId, command);
        const location = await locationLifecycleProjection(transaction, organizationId, locationId);
        return {
          impact: {
            historicalReportFactsRewritten: false,
            historicalTimestampsRewritten: false,
            newTimezone: location.timezone,
            previousTimezone: before.timezone,
          },
          location,
        };
      });
  }

  private authorize(
    transaction: PostgresTransaction,
    context: StaffSessionContext,
    organizationId: string,
    locationId?: string,
  ) {
    return authorizeCompanyAdminManagement(transaction, context, {
      assurance: "SENSITIVE",
      capability: "LOCATION_LIFECYCLE_MANAGE_ELIGIBLE",
      organizationId,
      ...(locationId === undefined ? {} : {
        requireActiveLocation: false,
        targetLocationId: locationId,
      }),
    });
  }

  private locationMutation<T extends ManagementLocationLifecycleCommand>(
    context: StaffSessionContext,
    organizationId: string,
    locationId: string,
    command: T,
    mutation: (
      transaction: PostgresTransaction, actorMembershipId: string,
      organizationId: string, locationId: string, command: T,
    ) => Promise<unknown>,
    lockSettings = false,
  ): Promise<ManagementLocationLifecycleResponse> {
    return this.locationTransaction(context, organizationId, locationId, "EXCLUSIVE",
      async (transaction, actor) => {
        await mutation(transaction, actor.membershipId, organizationId, locationId, command);
        return locationLifecycleProjection(transaction, organizationId, locationId);
      }, lockSettings);
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
      await lockLocationLifecycle(transaction, locationId, mode);
      if (settingsAlreadyLocked) {
        await lockManagementSettingsOrganization(transaction, organizationId, "EXCLUSIVE");
      }
      const actor = await this.authorize(transaction, context, organizationId, locationId);
      const result = await operation(transaction, actor);
      await recordAdminActivityInTransaction(transaction, context);
      return result;
    });
  }
}
