import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MapSetupTestContext, validArea } from "./map-setup-test-context";

const context = new MapSetupTestContext("map-area-http");
const areaPath = (locationId: string) =>
  `/v1/staff/locations/${locationId}/map/areas`;

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("VAL-007B Location map area management", () => {
  it("creates and reads a valid ordered polygon with a same-Location ParkingZone", async () => {
    const actor = await context.actor();
    const parkingZoneId = await context.parkingZone(actor.fixture);
    const created = await context.request(
      "POST",
      areaPath(actor.fixture.locationId),
      {
        body: { ...validArea, parkingZoneId },
        token: actor.token,
      },
    );
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      active: true,
      parkingZoneId,
      purpose: "PARKING",
      vertices: validArea.vertices.map((vertex, position) => ({
        ...vertex,
        position,
      })),
    });
    const listed = await context.request(
      "GET",
      areaPath(actor.fixture.locationId),
      { token: actor.token },
    );
    expect(listed.body.areas).toEqual([created.body]);

    const audit = await context.audit(String(created.body.id));
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]?.metadata_json).toEqual({
      active: true,
      configurationType: "PARKING",
      operation: "AREA_CREATED",
      parkingZoneLinked: true,
      resourceId: created.body.id,
      resourceType: "LocationMapArea",
    });
    expect(JSON.stringify(audit.rows[0]?.metadata_json)).not.toMatch(
      /latitude|longitude|vertices|31\.95|35\.91/i,
    );
  });

  it.each([
    [[validArea.vertices[0], validArea.vertices[1]], "short polygon"],
    [
      [
        { latitude: 91, longitude: 35 },
        validArea.vertices[1],
        validArea.vertices[2],
      ],
      "invalid latitude",
    ],
    [
      [
        { latitude: 31, longitude: 181 },
        validArea.vertices[1],
        validArea.vertices[2],
      ],
      "invalid longitude",
    ],
  ] as const)("rejects %s without an audit", async (vertices, label) => {
    expect(label).toBeTruthy();
    const actor = await context.actor();
    const response = await context.request(
      "POST",
      areaPath(actor.fixture.locationId),
      { body: { ...validArea, vertices }, token: actor.token },
    );
    expect(response.status).toBe(400);
    const audits = await context.database.adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events
       WHERE organization_id = $1`,
      [actor.fixture.organizationId],
    );
    expect(audits.rows[0]?.count).toBe("0");
  });

  it("rejects a foreign ParkingZone and leaves parking authority unchanged", async () => {
    const actor = await context.actor();
    const foreign = await context.actor();
    const foreignZoneId = await context.parkingZone(foreign.fixture);
    const parkingSpotId = randomUUID();
    await context.database.adminPool.query(
      `INSERT INTO parking_spots
         (id, organization_id, location_id, parking_zone_id,
          code, label, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'Foreign spot', transaction_timestamp())`,
      [
        parkingSpotId,
        foreign.fixture.organizationId,
        foreign.fixture.locationId,
        foreignZoneId,
        randomUUID(),
      ],
    );
    const before = await context.database.adminPool.query(
      `SELECT zone.id AS zone_id, spot.id AS spot_id,
              spot.parking_zone_id
       FROM parking_zones zone
       INNER JOIN parking_spots spot ON spot.parking_zone_id = zone.id
       WHERE zone.id = $1 AND spot.id = $2`,
      [foreignZoneId, parkingSpotId],
    );
    const response = await context.request(
      "POST",
      areaPath(actor.fixture.locationId),
      {
        body: { ...validArea, parkingZoneId: foreignZoneId },
        token: actor.token,
      },
    );
    expect(response.status).toBe(404);
    const after = await context.database.adminPool.query(
      `SELECT zone.id AS zone_id, spot.id AS spot_id,
              spot.parking_zone_id
       FROM parking_zones zone
       INNER JOIN parking_spots spot ON spot.parking_zone_id = zone.id
       WHERE zone.id = $1 AND spot.id = $2`,
      [foreignZoneId, parkingSpotId],
    );
    expect(after.rows).toEqual(before.rows);
    expect((await context.audit(foreignZoneId)).rows).toHaveLength(0);
  });

  it("keeps direct map-table writes denied while authorized functions succeed", async () => {
    const actor = await context.actor();
    const noAccess = await context.actor({ locationAccess: false });
    for (const sql of [
      `INSERT INTO location_map_points
         (id, organization_id, location_id, kind, code, label,
          latitude, longitude, updated_at)
       VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
               'ENTRANCE', 'X', 'X', 0, 0, transaction_timestamp())`,
      `UPDATE location_map_points SET active = false`,
      `DELETE FROM location_map_points`,
      `TRUNCATE location_map_points`,
    ]) {
      await expect(context.database.runtimePool.query(sql)).rejects.toMatchObject({
        code: "42501",
      });
    }
    await expect(
      context.database.runtimePool.query(
        `SELECT map_setup_create_point(
           $1, $2, $3, 'ENTRANCE', 'DENIED', 'Denied', 0, 0, NULL, true
         )`,
        [
          noAccess.fixture.membershipId,
          noAccess.fixture.locationId,
          randomUUID(),
        ],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    const created = await context.request(
      "POST",
      areaPath(actor.fixture.locationId),
      { body: validArea, token: actor.token },
    );
    expect(created.status).toBe(201);
  });

  it("rolls back invalid replacement and serializes concurrent full replacements", async () => {
    const actor = await context.actor();
    const created = await context.request(
      "POST",
      areaPath(actor.fixture.locationId),
      { body: validArea, token: actor.token },
    );
    const areaId = String(created.body.id);
    const replace = (latitudes: number[], longitudes: number[]) =>
      context.database.runtimePool.query(
        `SELECT map_setup_replace_area_vertices(
           $1, $2, $3, $4::numeric[], $5::numeric[]
         )`,
        [
          actor.fixture.membershipId,
          actor.fixture.locationId,
          areaId,
          latitudes,
          longitudes,
        ],
      );
    await expect(replace([1, 2], [1, 2])).rejects.toMatchObject({
      code: "22023",
    });
    const unchanged = await context.request(
      "GET",
      areaPath(actor.fixture.locationId),
      { token: actor.token },
    );
    expect((unchanged.body.areas as Array<Record<string, unknown>>)[0]?.vertices)
      .toEqual(
        validArea.vertices.map((vertex, position) => ({ ...vertex, position })),
      );

    const first = { lat: [10, 11, 12], lon: [20, 21, 22] };
    const second = { lat: [40, 41, 42], lon: [50, 51, 52] };
    await Promise.all([
      replace(first.lat, first.lon),
      replace(second.lat, second.lon),
    ]);
    const final = await context.request(
      "GET",
      areaPath(actor.fixture.locationId),
      { token: actor.token },
    );
    const vertices = (final.body.areas as Array<Record<string, unknown>>)[0]
      ?.vertices;
    const expected = [first, second].map((set) =>
      set.lat.map((latitude, position) => ({
        latitude,
        longitude: set.lon[position],
        position,
      })),
    );
    expect(expected).toContainEqual(vertices);
  });

  it("uses safe definer ownership, search_path, and execute ACLs", async () => {
    const result = await context.database.adminPool.query<{
      owner: string;
      proconfig: string[];
      public_execute: boolean;
      runtime_execute: boolean;
      security_definer: boolean;
    }>(
      `SELECT owner.rolname AS owner, function.prosecdef AS security_definer,
              function.proconfig,
              has_function_privilege($1, function.oid, 'EXECUTE') AS runtime_execute,
              EXISTS (
                SELECT 1 FROM aclexplode(function.proacl) privilege
                WHERE privilege.grantee = 0
                  AND privilege.privilege_type = 'EXECUTE'
              ) AS public_execute
       FROM pg_proc function
       INNER JOIN pg_roles owner ON owner.oid = function.proowner
       WHERE function.proname = 'map_setup_create_area'`,
      [context.database.runtimeRole],
    );
    expect(result.rows[0]).toMatchObject({
      proconfig: ["search_path=pg_catalog, public"],
      public_execute: false,
      runtime_execute: true,
      security_definer: true,
    });
    expect(result.rows[0]?.owner).not.toBe(context.database.runtimeRole);
    const helpers = await context.database.adminPool.query<{
      audit_execute: boolean;
      authorization_execute: boolean;
      validation_execute: boolean;
    }>(
      `SELECT
         has_function_privilege($1,
           'map_setup_authorized_organization(uuid,uuid)', 'EXECUTE')
           AS authorization_execute,
         has_function_privilege($1,
           'map_setup_validate_labels(text,text,text)', 'EXECUTE')
           AS validation_execute,
         has_function_privilege($1,
           'map_setup_append_audit(uuid,uuid,uuid,text,text,uuid,text,boolean,boolean)',
           'EXECUTE') AS audit_execute`,
      [context.database.runtimeRole],
    );
    expect(helpers.rows[0]).toEqual({
      audit_execute: false,
      authorization_execute: false,
      validation_execute: false,
    });
  });
});
