import { Inject, Injectable } from "@nestjs/common";
import type { PhysicalResourceListQuery } from "@valet/contracts";

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

@Injectable()
export class PhysicalResourceReadService {
  constructor(@Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool) {}

  listKeySlots(context: StaffSessionContext, locationId: string, query: PhysicalResourceListQuery) {
    return inPostgresTransaction(this.pool, async (transaction) => {
      const authority = await authorizePhysicalResourceManagement(transaction, context, locationId, "LIST");
      const result = await listKeySlots(transaction, authority, query);
      if (authority.role === "ORG_ADMIN") await recordAdminActivityInTransaction(transaction, context);
      return result;
    });
  }

  listParkingSpots(context: StaffSessionContext, locationId: string, query: PhysicalResourceListQuery) {
    return inPostgresTransaction(this.pool, async (transaction) => {
      const authority = await authorizePhysicalResourceManagement(transaction, context, locationId, "LIST");
      const result = await listParkingSpots(transaction, authority, query);
      if (authority.role === "ORG_ADMIN") await recordAdminActivityInTransaction(transaction, context);
      return result;
    });
  }

  listParkingZones(context: StaffSessionContext, locationId: string, query: PhysicalResourceListQuery) {
    return inPostgresTransaction(this.pool, async (transaction) => {
      const authority = await authorizePhysicalResourceManagement(transaction, context, locationId, "LIST");
      const result = await listParkingZoneSelectors(transaction, authority, query);
      if (authority.role === "ORG_ADMIN") await recordAdminActivityInTransaction(transaction, context);
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
      const authority = await authorizePhysicalResourceManagement(transaction, context, locationId, "LABEL");
      const result = await readPhysicalResourceLabel(transaction, authority, kind, resourceId);
      if (authority.role === "ORG_ADMIN") await recordAdminActivityInTransaction(transaction, context);
      return result;
    });
  }
}
