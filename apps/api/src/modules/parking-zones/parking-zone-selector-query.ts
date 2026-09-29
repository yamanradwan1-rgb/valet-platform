import type {
  ParkingZoneSelector,
  PhysicalResourceListQuery,
} from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import { ApiTransportValidationError } from "../../common/http/api-errors";

interface ParkingZoneScope {
  readonly locationId: string;
  readonly organizationId: string;
}

interface ZoneRow {
  readonly code: string;
  readonly label: string;
  readonly parkingZoneId: string;
  readonly status: "ACTIVE" | "INACTIVE";
}

interface CursorValue {
  readonly id: string;
  readonly sortKey: string;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cursorCodec(locationId: string) {
  return {
    decode(value?: string): CursorValue | null {
      if (value === undefined) return null;
      try {
        const decoded: unknown = JSON.parse(
          Buffer.from(value, "base64url").toString("utf8"),
        );
        if (typeof decoded !== "object" || decoded === null) throw new Error();
        const item = decoded as Record<string, unknown>;
        if (
          Object.keys(item).length !== 5 ||
          item.v !== 1 ||
          item.d !== "parking-zones" ||
          item.l !== locationId ||
          typeof item.s !== "string" ||
          item.s.length < 1 ||
          item.s.length > 160 ||
          typeof item.i !== "string" ||
          !uuidPattern.test(item.i)
        ) throw new Error();
        return { id: item.i, sortKey: item.s };
      } catch {
        throw new ApiTransportValidationError();
      }
    },
    encode(value: CursorValue): string {
      return Buffer.from(
        JSON.stringify({
          d: "parking-zones",
          i: value.id,
          l: locationId,
          s: value.sortKey,
          v: 1,
        }),
        "utf8",
      ).toString("base64url");
    },
  };
}

export async function listParkingZoneSelectors(
  transaction: PostgresTransaction,
  scope: ParkingZoneScope,
  query: PhysicalResourceListQuery,
) {
  const codec = cursorCodec(scope.locationId);
  const cursor = codec.decode(query.cursor);
  const parameters: unknown[] = [scope.organizationId, scope.locationId];
  let keyset = "";
  if (cursor !== null) {
    parameters.push(cursor.sortKey, cursor.id);
    keyset = "AND (zone.code, zone.id) > ($3, $4::uuid)";
  }
  parameters.push(query.limit + 1);
  const result = await transaction.query<ZoneRow>(
    `SELECT zone.id::text AS "parkingZoneId", zone.code, zone.label,
            zone.status::text AS status
     FROM parking_zones AS zone
     WHERE zone.organization_id = $1 AND zone.location_id = $2
       AND zone.status = 'ACTIVE' ${keyset}
     ORDER BY zone.code, zone.id LIMIT $${parameters.length}`,
    parameters,
  );
  const hasNext = result.rows.length > query.limit;
  const rows = result.rows.slice(0, query.limit);
  const items: ParkingZoneSelector[] = [...rows];
  const last = rows.at(-1);
  return {
    items,
    nextCursor:
      hasNext && last !== undefined
        ? codec.encode({ id: last.parkingZoneId, sortKey: last.code })
        : null,
  };
}
