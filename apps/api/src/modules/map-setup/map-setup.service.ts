import { Inject, Injectable } from "@nestjs/common";
import type {
  CreateLocationMapAreaRequest,
  CreateLocationMapPointRequest,
  ReplaceLocationMapAreaVerticesRequest,
  PhysicalResourceListQuery,
  UpdateLocationMapAreaRequest,
  UpdateLocationMapPointRequest,
} from "@valet/contracts";
import {
  RUNTIME_POSTGRES_POOL,
} from "../../common/database/runtime-database.module";
import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { createMapArea, replaceMapAreaVertices, updateMapArea } from "./map-area-command";
import { createMapPoint, updateMapPoint } from "./map-point-command";
import { authorizeLocationMapSetup } from "./map-setup-authorization";
import { loadMapAreas, loadMapPoints } from "./map-setup-projections";
import { listParkingZoneSelectors } from "../parking-zones/parking-zone-selector-query";

interface Scope {
  readonly authenticatedUserId: string;
  readonly locationId: string;
}

@Injectable()
export class MapSetupService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
  ) {}

  listPoints(input: Scope) {
    return inPostgresTransaction(this.pool, async (transaction) => {
      const actor = await authorizeLocationMapSetup(
        transaction,
        input.authenticatedUserId,
        input.locationId,
      );
      return loadMapPoints(
        transaction,
        actor.organizationId,
        input.locationId,
      );
    });
  }

  createPoint(input: Scope & CreateLocationMapPointRequest) {
    return createMapPoint(this.pool, input);
  }

  updatePoint(
    input: Scope &
      UpdateLocationMapPointRequest & { readonly pointId: string },
  ) {
    return updateMapPoint(this.pool, input);
  }

  listAreas(input: Scope) {
    return inPostgresTransaction(this.pool, async (transaction) => {
      const actor = await authorizeLocationMapSetup(
        transaction,
        input.authenticatedUserId,
        input.locationId,
      );
      return loadMapAreas(
        transaction,
        actor.organizationId,
        input.locationId,
      );
    });
  }

  listParkingZones(input: Scope & PhysicalResourceListQuery) {
    return inPostgresTransaction(this.pool, async (transaction) => {
      const actor = await authorizeLocationMapSetup(
        transaction,
        input.authenticatedUserId,
        input.locationId,
      );
      return listParkingZoneSelectors(
        transaction,
        {
          locationId: input.locationId,
          organizationId: actor.organizationId,
        },
        input,
      );
    });
  }

  createArea(input: Scope & CreateLocationMapAreaRequest) {
    return createMapArea(this.pool, input);
  }

  updateArea(
    input: Scope & UpdateLocationMapAreaRequest & { readonly areaId: string },
  ) {
    return updateMapArea(this.pool, input);
  }

  replaceVertices(
    input: Scope &
      ReplaceLocationMapAreaVerticesRequest & { readonly areaId: string },
  ) {
    return replaceMapAreaVertices(this.pool, input);
  }
}
