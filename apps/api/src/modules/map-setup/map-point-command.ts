import { randomUUID } from "node:crypto";
import type {
  CreateLocationMapPointRequest,
  LocationMapPoint,
  UpdateLocationMapPointRequest,
} from "@valet/contracts";
import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { authorizeLocationMapSetup } from "./map-setup-authorization";
import { MapSetupError, mapSetupDatabaseError } from "./map-setup-errors";
import { loadMapPoints } from "./map-setup-projections";

interface PointScope {
  readonly authenticatedUserId: string;
  readonly locationId: string;
}

function pointArguments(point: CreateLocationMapPointRequest) {
  return [
    point.kind,
    point.code,
    point.label,
    point.latitude,
    point.longitude,
    point.levelLabel,
    point.active,
  ] as const;
}

export async function createMapPoint(
  pool: PostgresPool,
  input: PointScope & CreateLocationMapPointRequest,
): Promise<LocationMapPoint> {
  return inPostgresTransaction(pool, async (transaction) => {
    const actor = await authorizeLocationMapSetup(
      transaction,
      input.authenticatedUserId,
      input.locationId,
    );
    const pointId = randomUUID();
    try {
      await transaction.query(
        `SELECT map_setup_create_point(
           $1, $2, $3, $4::location_map_point_kind, $5, $6,
           $7::numeric, $8::numeric, $9, $10
         )`,
        [actor.membershipId, input.locationId, pointId, ...pointArguments(input)],
      );
    } catch (error) {
      mapSetupDatabaseError(error);
    }
    const point = (
      await loadMapPoints(
        transaction,
        actor.organizationId,
        input.locationId,
        pointId,
      )
    )[0];
    if (point === undefined) throw new MapSetupError("AUTHORIZATION_DENIED");
    return point;
  });
}

export async function updateMapPoint(
  pool: PostgresPool,
  input: PointScope &
    UpdateLocationMapPointRequest & { readonly pointId: string },
): Promise<LocationMapPoint> {
  return inPostgresTransaction(pool, async (transaction) => {
    const actor = await authorizeLocationMapSetup(
      transaction,
      input.authenticatedUserId,
      input.locationId,
    );
    const current = (
      await loadMapPoints(
        transaction,
        actor.organizationId,
        input.locationId,
        input.pointId,
      )
    )[0];
    if (current === undefined) throw new MapSetupError("AUTHORIZATION_DENIED");
    const next: CreateLocationMapPointRequest = {
      active: input.active ?? current.active,
      code: input.code ?? current.code,
      kind: input.kind ?? current.kind,
      label: input.label ?? current.label,
      latitude: input.latitude ?? current.latitude,
      levelLabel:
        input.levelLabel === undefined ? current.levelLabel : input.levelLabel,
      longitude: input.longitude ?? current.longitude,
    };
    try {
      await transaction.query(
        `SELECT map_setup_update_point(
           $1, $2, $3, $4::location_map_point_kind, $5, $6,
           $7::numeric, $8::numeric, $9, $10, $11::timestamptz
         )`,
        [
          actor.membershipId,
          input.locationId,
          input.pointId,
          ...pointArguments(next),
          current.updatedAt,
        ],
      );
    } catch (error) {
      mapSetupDatabaseError(error);
    }
    const point = (
      await loadMapPoints(
        transaction,
        actor.organizationId,
        input.locationId,
        input.pointId,
      )
    )[0];
    if (point === undefined) throw new MapSetupError("AUTHORIZATION_DENIED");
    return point;
  });
}
