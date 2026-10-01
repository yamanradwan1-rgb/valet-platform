import { Inject, Injectable } from "@nestjs/common";
import type {
  CreateKeySlotRequest,
  CreateParkingSpotRequest,
  CreateParkingZoneRequest,
} from "@valet/contracts";

import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { recordAdminActivityInTransaction } from "../auth/mfa/mfa-assurance-policy";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { authorizePhysicalResourceManagement } from "./physical-resource-authorization";
import { createKeySlot, createParkingSpot } from "./physical-resource-command";
import { createParkingZone } from "./parking-zone-command";

@Injectable()
export class PhysicalResourceWriteService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
  ) {}

  createParkingZone(
    context: StaffSessionContext,
    locationId: string,
    request: CreateParkingZoneRequest,
  ) {
    return inPostgresTransaction(this.pool, async (transaction) => {
      const authority = await authorizePhysicalResourceManagement(
        transaction,
        context,
        locationId,
        "CREATE",
      );
      const result = await createParkingZone(transaction, authority, request);
      if (authority.role === "ORG_ADMIN")
        await recordAdminActivityInTransaction(transaction, context);
      return result;
    });
  }

  createKeySlot(
    context: StaffSessionContext,
    locationId: string,
    request: CreateKeySlotRequest,
  ) {
    return inPostgresTransaction(this.pool, async (transaction) => {
      const authority = await authorizePhysicalResourceManagement(
        transaction,
        context,
        locationId,
        "CREATE",
      );
      const result = await createKeySlot(transaction, authority, request);
      if (authority.role === "ORG_ADMIN") {
        await recordAdminActivityInTransaction(transaction, context);
      }
      return result;
    });
  }

  createParkingSpot(
    context: StaffSessionContext,
    locationId: string,
    request: CreateParkingSpotRequest,
  ) {
    return inPostgresTransaction(this.pool, async (transaction) => {
      const authority = await authorizePhysicalResourceManagement(
        transaction,
        context,
        locationId,
        "CREATE",
      );
      const result = await createParkingSpot(transaction, authority, request);
      if (authority.role === "ORG_ADMIN") {
        await recordAdminActivityInTransaction(transaction, context);
      }
      return result;
    });
  }
}
