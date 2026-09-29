import { randomUUID } from "node:crypto";
import type {
  CreateLocationMapAreaRequest,
  LocationMapArea,
  ReplaceLocationMapAreaVerticesRequest,
  UpdateLocationMapAreaRequest,
} from "@valet/contracts";
import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { authorizeLocationMapSetup } from "./map-setup-authorization";
import { MapSetupError, mapSetupDatabaseError } from "./map-setup-errors";
import { loadMapAreas } from "./map-setup-projections";

interface AreaScope {
  readonly authenticatedUserId: string;
  readonly locationId: string;
}

function areaArguments(area: Omit<CreateLocationMapAreaRequest, "vertices">) {
  return [
    area.purpose,
    area.code,
    area.label,
    area.levelLabel,
    area.active,
    area.parkingZoneId,
  ] as const;
}

function vertexArguments(input: Pick<CreateLocationMapAreaRequest, "vertices">) {
  return [
    input.vertices.map((vertex) => vertex.latitude),
    input.vertices.map((vertex) => vertex.longitude),
  ] as const;
}

async function requireArea(
  areas: Promise<LocationMapArea[]>,
): Promise<LocationMapArea> {
  const area = (await areas)[0];
  if (area === undefined) throw new MapSetupError("AUTHORIZATION_DENIED");
  return area;
}

export async function createMapArea(
  pool: PostgresPool,
  input: AreaScope & CreateLocationMapAreaRequest,
): Promise<LocationMapArea> {
  return inPostgresTransaction(pool, async (transaction) => {
    const actor = await authorizeLocationMapSetup(
      transaction,
      input.authenticatedUserId,
      input.locationId,
    );
    const areaId = randomUUID();
    try {
      await transaction.query(
        `SELECT map_setup_create_area(
           $1, $2, $3, $4::location_map_area_purpose, $5, $6, $7,
           $8, $9, $10::numeric[], $11::numeric[]
         )`,
        [
          actor.membershipId,
          input.locationId,
          areaId,
          ...areaArguments(input),
          ...vertexArguments(input),
        ],
      );
    } catch (error) {
      mapSetupDatabaseError(error);
    }
    return requireArea(
      loadMapAreas(transaction, actor.organizationId, input.locationId, areaId),
    );
  });
}

export async function updateMapArea(
  pool: PostgresPool,
  input: AreaScope &
    UpdateLocationMapAreaRequest & { readonly areaId: string },
): Promise<LocationMapArea> {
  return inPostgresTransaction(pool, async (transaction) => {
    const actor = await authorizeLocationMapSetup(
      transaction,
      input.authenticatedUserId,
      input.locationId,
    );
    const current = await requireArea(
      loadMapAreas(
        transaction,
        actor.organizationId,
        input.locationId,
        input.areaId,
      ),
    );
    const next: Omit<CreateLocationMapAreaRequest, "vertices"> = {
      active: input.active ?? current.active,
      code: input.code ?? current.code,
      label: input.label ?? current.label,
      levelLabel:
        input.levelLabel === undefined ? current.levelLabel : input.levelLabel,
      parkingZoneId:
        input.parkingZoneId === undefined
          ? current.parkingZoneId
          : input.parkingZoneId,
      purpose: input.purpose ?? current.purpose,
    };
    try {
      await transaction.query(
        `SELECT map_setup_update_area(
           $1, $2, $3, $4::location_map_area_purpose, $5, $6, $7, $8, $9,
           $10::timestamptz
         )`,
        [
          actor.membershipId,
          input.locationId,
          input.areaId,
          ...areaArguments(next),
          input.expectedUpdatedAt,
        ],
      );
    } catch (error) {
      mapSetupDatabaseError(error);
    }
    return requireArea(
      loadMapAreas(
        transaction,
        actor.organizationId,
        input.locationId,
        input.areaId,
      ),
    );
  });
}

export async function replaceMapAreaVertices(
  pool: PostgresPool,
  input: AreaScope &
    ReplaceLocationMapAreaVerticesRequest & { readonly areaId: string },
): Promise<LocationMapArea> {
  return inPostgresTransaction(pool, async (transaction) => {
    const actor = await authorizeLocationMapSetup(
      transaction,
      input.authenticatedUserId,
      input.locationId,
    );
    try {
      await transaction.query(
        `SELECT map_setup_replace_area_vertices(
           $1, $2, $3, $4::numeric[], $5::numeric[], $6::timestamptz
         )`,
        [
          actor.membershipId,
          input.locationId,
          input.areaId,
          ...vertexArguments(input),
          input.expectedUpdatedAt,
        ],
      );
    } catch (error) {
      mapSetupDatabaseError(error);
    }
    return requireArea(
      loadMapAreas(
        transaction,
        actor.organizationId,
        input.locationId,
        input.areaId,
      ),
    );
  });
}
