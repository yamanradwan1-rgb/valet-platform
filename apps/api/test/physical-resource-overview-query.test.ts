import { describe, expect, it } from "vitest";
import type { PostgresTransaction } from "../src/common/database/postgres";
import type { PhysicalResourceAuthority } from "../src/modules/dashboard/physical-resource-authorization";
import {
  countPhysicalResources,
  listUnifiedKeySlots,
  readPhysicalResourceOverview,
} from "../src/modules/dashboard/physical-resource-overview-query";

const ORG = "00000000-0000-4000-8000-000000000001";
const LOCATION = "00000000-0000-4000-8000-000000000002";
const SLOT = "00000000-0000-4000-8000-000000000003";
const SESSION = "00000000-0000-4000-8000-000000000004";
const SPOT = "00000000-0000-4000-8000-000000000005";
const NOW = new Date("2026-10-20T12:00:00Z");
const authority: PhysicalResourceAuthority = {
  organizationId: ORG,
  locationId: LOCATION,
  membershipId: ORG,
  role: "LOCATION_MANAGER",
};

function fakeTx(options: { operational?: boolean } = {}) {
  const statements: { sql: string; args: unknown[] }[] = [];
  const query = async (sql: string, args: unknown[] = []) => {
    statements.push({ sql, args });
    if (sql.includes("CROSS JOIN LATERAL")) {
      return {
        rowCount: 1,
        rows: [
          {
            operational: options.operational ?? true,
            keyConfigured: 8,
            keyActive: 6,
            keyAvailable: 2,
            keyInUse: 4,
            keyInactive: 2,
            spotConfigured: 8,
            spotActive: 7,
            spotAvailable: 3,
            spotOccupied: 4,
            spotInactive: 1,
          },
        ],
      };
    }
    if (sql.includes("FROM key_slots AS slot"))
      return {
        rowCount: 2,
        rows: [
          {
            keySlotId: SLOT,
            code: "K-01",
            label: "Front desk",
            status: "ACTIVE",
            operational: options.operational ?? true,
            holdingSessionId: options.operational === false ? null : SESSION,
            plateNumberNormalized: null,
            temporaryDescriptor: null,
          },
          {
            keySlotId: SESSION,
            code: "K-02",
            label: null,
            status: "INACTIVE",
            operational: options.operational ?? true,
            holdingSessionId: null,
            plateNumberNormalized: null,
            temporaryDescriptor: null,
          },
        ],
      };
    if (sql.includes("FROM parking_spots AS spot"))
      return {
        rowCount: 1,
        rows: [
          {
            parkingSpotId: SPOT,
            code: "P-01",
            label: "Bay 1",
            status: "ACTIVE",
            createdAt: NOW,
            updatedAt: NOW,
            zoneId: null,
            zoneCode: null,
            zoneLabel: null,
            zoneStatus: null,
            operational: options.operational ?? true,
            sessionId: options.operational === false ? null : SESSION,
            sessionState: options.operational === false ? null : "PARKED",
            plateNumberNormalized: null,
            temporaryDescriptor: null,
          },
        ],
      };
    throw new Error("Unexpected query");
  };
  return { tx: { query } as unknown as PostgresTransaction, statements };
}

describe("Issue #304 resource overview projection", () => {
  it("counts all records independent of limit, in three scoped SQL roundtrips", async () => {
    const { tx, statements } = fakeTx();
    const result = await readPhysicalResourceOverview(tx, authority, {
      limit: 1,
    });
    expect(result.counts).toEqual({
      keySlots: {
        configured: 8,
        active: 6,
        available: 2,
        inUse: 4,
        unknown: 2,
      },
      parkingSpots: {
        configured: 8,
        active: 7,
        available: 3,
        occupied: 4,
        unknown: 1,
      },
    });
    expect(result.keySlots.items).toHaveLength(1);
    expect(result.keySlots.nextCursor).toEqual(expect.any(String));
    expect(result.keySlots.items[0]).toMatchObject({
      usage: "IN_USE",
      holdingSessionId: SESSION,
      holdingVehicle: {
        plateNumberNormalized: null,
        temporaryDescriptor: null,
      },
      label: "Front desk",
    });
    expect(result.parkingSpots.items[0]).toMatchObject({ usage: "OCCUPIED" });
    expect(statements).toHaveLength(3);
    for (const { sql, args } of statements) {
      expect(sql).toContain("organization_id");
      expect(sql).toContain("location_id");
      expect(args.slice(0, 2)).toEqual([ORG, LOCATION]);
    }
    expect(statements[0]?.sql).not.toContain("LIMIT");
  });

  it("never projects a 0 availability for an inactive Location", async () => {
    const { tx } = fakeTx({ operational: false });
    const counts = await countPhysicalResources(tx, authority);
    expect(counts.keySlots).toEqual({
      configured: 8,
      active: 6,
      available: null,
      inUse: null,
      unknown: 8,
    });
    expect(counts.parkingSpots).toEqual({
      configured: 8,
      active: 7,
      available: null,
      occupied: null,
      unknown: 8,
    });
    const keys = await listUnifiedKeySlots(tx, authority, { limit: 1 });
    expect(keys.items[0]?.usage).toBe("UNKNOWN");
    expect(keys.items[0]?.holdingSessionId).toBeNull();
  });

  it("binds cursor to the authorized Location and resource family", async () => {
    const { tx } = fakeTx();
    const first = await listUnifiedKeySlots(tx, authority, { limit: 1 });
    const cursor = first.nextCursor!;
    await expect(
      listUnifiedKeySlots(
        tx,
        {
          ...authority,
          locationId: ORG,
        },
        { limit: 1, keyCursor: cursor },
      ),
    ).rejects.toThrow();
  });

  it("pushes both independent usage filters into scoped SQL before keyset LIMIT", async () => {
    const { tx, statements } = fakeTx();
    const result = await readPhysicalResourceOverview(tx, authority, {
      limit: 1,
      keyFilter: "busy",
      spotFilter: "inactive",
    });
    expect(result.counts.keySlots.configured).toBe(8);
    expect(result.counts.parkingSpots.configured).toBe(8);
    expect(statements).toHaveLength(3);
    const keySql = statements[1]!.sql;
    const spotSql = statements[2]!.sql;
    expect(keySql).toContain(
      "slot.status = 'ACTIVE' AND location.status = 'ACTIVE' AND holder.id IS NOT NULL",
    );
    expect(spotSql).toContain("spot.status = 'INACTIVE'");
    expect(keySql.indexOf("holder.id IS NOT NULL")).toBeLessThan(
      keySql.indexOf("ORDER BY slot.code"),
    );
    expect(spotSql.indexOf("spot.status = 'INACTIVE'")).toBeLessThan(
      spotSql.indexOf("ORDER BY spot.code"),
    );
    expect(statements[0]!.sql).not.toContain("LIMIT");
    expect(statements[1]!.args.slice(0, 2)).toEqual([ORG, LOCATION]);
    expect(statements[2]!.args.slice(0, 2)).toEqual([ORG, LOCATION]);
  });

  it("keeps legacy unfiltered SQL and excludes unknown from available", async () => {
    const { tx, statements } = fakeTx();
    await readPhysicalResourceOverview(tx, authority, { limit: 2 });
    expect(statements[1]!.sql).not.toContain("holder.id IS NULL");
    expect(statements[2]!.sql).not.toContain("session.id IS NULL");
    const filtered = fakeTx();
    await readPhysicalResourceOverview(filtered.tx, authority, {
      limit: 2,
      keyFilter: "available",
      spotFilter: "available",
    });
    expect(filtered.statements[1]!.sql).toContain(
      "slot.status = 'ACTIVE' AND location.status = 'ACTIVE' AND holder.id IS NULL",
    );
    expect(filtered.statements[2]!.sql).toContain(
      "spot.status = 'ACTIVE' AND location.status = 'ACTIVE' AND session.id IS NULL",
    );
  });
});
