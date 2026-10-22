import { Inject, Injectable } from "@nestjs/common";
import type {
  GuestInformationLocale,
  ManagementGuestContactCompanyUpdateRequest,
  ManagementGuestContactLocationUpdateRequest,
  ManagementGuestPrivacyPublishRequest,
  ManagementGuestPrivacySaveRequest,
} from "@valet/contracts";

import type { PostgresPool, PostgresTransaction } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { recordAdminActivityInTransaction } from "../auth/mfa/mfa-assurance-policy";
import type { StaffSessionContext } from "../auth/staff-session-context";
import {
  authorizeGuestInformationCompany,
  authorizeGuestInformationLocation,
  type GuestInformationActor,
} from "./guest-information-authorization";
import {
  readGuestCompanyContact,
  readGuestLocationContact,
  saveGuestCompanyContact,
  saveGuestLocationContact,
} from "./guest-information-contact-repository";
import {
  publishGuestPrivacy,
  readGuestPrivacy,
  saveGuestPrivacy,
} from "./guest-information-privacy-repository";
import { readGuestInformationProjection } from "./guest-information-public-projection";
import { readGuestInformationOverview } from "./guest-information-overview";

type AuthorizedOperation<T> = (
  transaction: PostgresTransaction,
  actor: GuestInformationActor,
) => Promise<T>;

@Injectable()
export class GuestInformationStaffService {
  constructor(@Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool) {}

  overview(context: StaffSessionContext, organizationId: string, locale: GuestInformationLocale) {
    return inPostgresTransaction(this.pool, async (transaction) => {
      const result = await readGuestInformationOverview(transaction, context, organizationId, locale);
      await recordAdminActivityInTransaction(transaction, context);
      return result;
    });
  }

  readCompany(context: StaffSessionContext, organizationId: string) {
    return this.companyTransaction(context, organizationId, false,
      (transaction) => readGuestCompanyContact(transaction, organizationId));
  }

  updateCompany(
    context: StaffSessionContext,
    organizationId: string,
    command: ManagementGuestContactCompanyUpdateRequest,
  ) {
    return this.companyTransaction(context, organizationId, true, async (transaction, actor) => {
      await saveGuestCompanyContact(transaction, actor.membershipId, organizationId,
        command.values, command.expectedRevision);
      return readGuestCompanyContact(transaction, organizationId);
    });
  }

  readPrivacy(context: StaffSessionContext, organizationId: string, locationId: string) {
    return this.locationTransaction(context, organizationId, locationId, false,
      (transaction) => readGuestPrivacy(transaction, organizationId, locationId));
  }

  savePrivacy(
    context: StaffSessionContext,
    organizationId: string,
    locationId: string,
    command: ManagementGuestPrivacySaveRequest,
  ) {
    return this.locationTransaction(context, organizationId, locationId, true,
      async (transaction, actor) => {
        await saveGuestPrivacy(transaction, actor.membershipId, organizationId, locationId, command);
        return readGuestPrivacy(transaction, organizationId, locationId);
      });
  }

  publishPrivacy(
    context: StaffSessionContext,
    organizationId: string,
    locationId: string,
    command: ManagementGuestPrivacyPublishRequest,
    publish: boolean,
  ) {
    return this.locationTransaction(context, organizationId, locationId, true,
      async (transaction, actor) => {
        await publishGuestPrivacy(transaction, actor.membershipId, organizationId,
          locationId, command.expectedRevision, publish);
        return readGuestPrivacy(transaction, organizationId, locationId);
      });
  }

  readLocationContact(context: StaffSessionContext, organizationId: string, locationId: string) {
    return this.locationTransaction(context, organizationId, locationId, false,
      (transaction) => readGuestLocationContact(transaction, organizationId, locationId));
  }

  updateLocationContact(
    context: StaffSessionContext,
    organizationId: string,
    locationId: string,
    command: ManagementGuestContactLocationUpdateRequest,
  ) {
    return this.locationTransaction(context, organizationId, locationId, true,
      async (transaction, actor) => {
        await saveGuestLocationContact(transaction, actor.membershipId, organizationId,
          locationId, command.values, command.expectedRevision);
        return readGuestLocationContact(transaction, organizationId, locationId);
      });
  }

  preview(
    context: StaffSessionContext,
    organizationId: string,
    locationId: string,
    locale: GuestInformationLocale,
  ) {
    return this.locationTransaction(context, organizationId, locationId, false,
      (transaction) => readGuestInformationProjection(transaction, {
        organizationId, locationId, locale,
      }));
  }

  private companyTransaction<T>(
    context: StaffSessionContext,
    organizationId: string,
    mutation: boolean,
    operation: AuthorizedOperation<T>,
  ): Promise<T> {
    return inPostgresTransaction(this.pool, async (transaction) => {
      const actor = await authorizeGuestInformationCompany(
        transaction, context, organizationId, mutation);
      const result = await operation(transaction, actor);
      await recordAdminActivityInTransaction(transaction, context);
      return result;
    });
  }

  private locationTransaction<T>(
    context: StaffSessionContext,
    organizationId: string,
    locationId: string,
    mutation: boolean,
    operation: AuthorizedOperation<T>,
  ): Promise<T> {
    return inPostgresTransaction(this.pool, async (transaction) => {
      const actor = await authorizeGuestInformationLocation(
        transaction, context, organizationId, locationId, mutation);
      const result = await operation(transaction, actor);
      await recordAdminActivityInTransaction(transaction, context);
      return result;
    });
  }
}
