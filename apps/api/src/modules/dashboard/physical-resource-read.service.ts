import { Inject, Injectable } from "@nestjs/common";
import type {
  PhysicalResourceListQuery,
  PhysicalResourceOverviewQuery,
  PhysicalResourceCustodyQuery,
} from "@valet/contracts";

import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { recordAdminActivityInTransaction } from "../auth/mfa/mfa-assurance-policy";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { authorizePhysicalResourceManagement } from "./physical-resource-authorization";
import {
  listKeySlots,
  listParkingSpots,
  readPhysicalResourceLabel,
} from "./physical-resource-query";
import { listParkingZoneSelectors } from "../parking-zones/parking-zone-selector-query";
import { readPhysicalResourceOverview } from "./physical-resource-overview-query";
import { readPhysicalResourceCustody } from "./physical-resource-custody-query";
import { inAuthorizedPhysicalResourceOverview } from "./physical-resource-overview-transaction";

@Injectable()
export class PhysicalResourceReadService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
  ) {}

  overview(
    context: StaffSessionContext,
    locationId: string,
    query: PhysicalResourceOverviewQuery,
  ) {
    return inAuthorizedPhysicalResourceOverview(
      this.pool, context, locationId, async (transaction, authority) => {
        const result = await readPhysicalResourceOverview(
          transaction,
          authority,
          query,
        );
        if (authority.role === "ORG_ADMIN")
          await recordAdminActivityInTransaction(transaction, context);
        return result;
      },
    );
  }

  keyCustody(
    context: StaffSessionContext,
    locationId: string,
    keySlotId: string,
    query: PhysicalResourceCustodyQuery,
  ) {
    return inPostgresTransaction(this.pool, async (transaction) => {
      const authority = await authorizePhysicalResourceManagement(
        transaction,
        context,
        locationId,
        "LIST",
        { kind: "READ_COMMITTED" },
      );
      const result = await readPhysicalResourceCustody(
        transaction,
        authority,
        keySlotId,
        query,
      );
      if (authority.role === "ORG_ADMIN")
        await recordAdminActivityInTransaction(transaction, context);
      return result;
    });
  }

  listKeySlots(
    context: StaffSessionContext,
    locationId: string,
    query: PhysicalResourceListQuery,
  ) {
    return inPostgresTransaction(this.pool, async (transaction) => {
      const authority = await authorizePhysicalResourceManagement(
        transaction,
        context,
        locationId,
        "LIST",
        { kind: "READ_COMMITTED" },
      );
      const result = await listKeySlots(transaction, authority, query);
      if (authority.role === "ORG_ADMIN")
        await recordAdminActivityInTransaction(transaction, context);
      return result;
    });
  }

  listParkingSpots(
    context: StaffSessionContext,
    locationId: string,
    query: PhysicalResourceListQuery,
  ) {
    return inPostgresTransaction(this.pool, async (transaction) => {
      const authority = await authorizePhysicalResourceManagement(
        transaction,
        context,
        locationId,
        "LIST",
        { kind: "READ_COMMITTED" },
      );
      const result = await listParkingSpots(transaction, authority, query);
      if (authority.role === "ORG_ADMIN")
        await recordAdminActivityInTransaction(transaction, context);
      return result;
    });
  }

  listParkingZones(
    context: StaffSessionContext,
    locationId: string,
    query: PhysicalResourceListQuery,
  ) {
    return inPostgresTransaction(this.pool, async (transaction) => {
      const authority = await authorizePhysicalResourceManagement(
        transaction,
        context,
        locationId,
        "LIST",
        { kind: "READ_COMMITTED" },
      );
      const result = await listParkingZoneSelectors(
        transaction,
        authority,
        query,
      );
      if (authority.role === "ORG_ADMIN")
        await recordAdminActivityInTransaction(transaction, context);
      return result;
    });
  }

  label(
    context: StaffSessionContext,
    locationId: string,
    kind: "key-slot" | "parking-spot",
    resourceId: string,
  ) {
    return inPostgresTransaction(this.pool, async (transaction) => {
      const authority = await authorizePhysicalResourceManagement(
        transaction,
        context,
        locationId,
        "LABEL",
        { kind: "READ_COMMITTED" },
      );
      const result = await readPhysicalResourceLabel(
        transaction,
        authority,
        kind,
        resourceId,
      );
      if (authority.role === "ORG_ADMIN")
        await recordAdminActivityInTransaction(transaction, context);
      return result;
    });
  }
}
