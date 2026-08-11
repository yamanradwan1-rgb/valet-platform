export async function seedPhase3Resources(query, ids, createdAt) {
  const zones = [
    [ids.zoneAmmanMain, ids.ammanLocation, "AMMAN-MAIN", "Amman Main"],
    [ids.zoneDubaiMain, ids.dubaiLocation, "DUBAI-MAIN", "Dubai Main"],
  ];
  for (const zone of zones) {
    await query(
      `INSERT INTO parking_zones
         (id, organization_id, location_id, code, label, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6, $6)
       ON CONFLICT (id) DO UPDATE SET
         code = EXCLUDED.code,
         label = EXCLUDED.label,
         status = EXCLUDED.status,
         updated_at = EXCLUDED.updated_at`,
      [zone[0], ids.organization, zone[1], zone[2], zone[3], createdAt],
    );
  }

  const spots = [
    [
      ids.spotA01,
      ids.ammanLocation,
      ids.zoneAmmanMain,
      "A-01",
      "Amman Demo Spot 01",
    ],
    [
      ids.spotA02,
      ids.ammanLocation,
      ids.zoneAmmanMain,
      "A-02",
      "Amman Demo Spot 02",
    ],
    [
      ids.spotA03,
      ids.ammanLocation,
      ids.zoneAmmanMain,
      "A-03",
      "Amman Demo Spot 03",
    ],
    [
      ids.spotA04,
      ids.ammanLocation,
      ids.zoneAmmanMain,
      "A-04",
      "Amman Demo Spot 04",
    ],
    [
      ids.spotD01,
      ids.dubaiLocation,
      ids.zoneDubaiMain,
      "D-01",
      "Dubai Demo Spot 01",
    ],
  ];
  for (const spot of spots) {
    await query(
      `INSERT INTO parking_spots
         (id, organization_id, location_id, parking_zone_id, code, label,
          status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', $7, $7)
       ON CONFLICT (id) DO UPDATE SET
         parking_zone_id = EXCLUDED.parking_zone_id,
         code = EXCLUDED.code,
         label = EXCLUDED.label,
         status = EXCLUDED.status,
         updated_at = EXCLUDED.updated_at`,
      [spot[0], ids.organization, ...spot.slice(1), createdAt],
    );
  }

  const keySlots = [
    [ids.keyK01, ids.ammanLocation, "K-01"],
    [ids.keyK02, ids.ammanLocation, "K-02"],
    [ids.keyK03, ids.ammanLocation, "K-03"],
    [ids.keyK04, ids.ammanLocation, "K-04"],
    [ids.keyDK01, ids.dubaiLocation, "DK-01"],
  ];
  for (const keySlot of keySlots) {
    await query(
      `INSERT INTO key_slots
         (id, organization_id, location_id, code, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $5)
       ON CONFLICT (id) DO UPDATE SET
         code = EXCLUDED.code,
         status = EXCLUDED.status,
         updated_at = EXCLUDED.updated_at`,
      [keySlot[0], ids.organization, keySlot[1], keySlot[2], createdAt],
    );
  }
}
