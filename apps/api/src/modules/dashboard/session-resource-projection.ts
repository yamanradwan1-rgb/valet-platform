export const sessionResourceColumns = `
  CASE WHEN key_slot.id IS NULL THEN NULL ELSE jsonb_build_object(
    'resourceId', key_slot.id, 'code', key_slot.code, 'label', NULL) END AS "keySlot",
  CASE WHEN spot.id IS NULL THEN NULL ELSE jsonb_build_object(
    'resourceId', spot.id, 'code', spot.code, 'label', spot.label) END AS "parkingSpot",
  CASE WHEN zone.id IS NULL THEN NULL ELSE jsonb_build_object(
    'resourceId', zone.id, 'code', zone.code, 'label', zone.label) END AS "parkingZone"`;

// Keep an inactive referenced resource truthful; never substitute a different one.
export const sessionResourceJoins = `
  LEFT JOIN key_slots AS key_slot
    ON key_slot.organization_id = session.organization_id
   AND key_slot.location_id = session.location_id AND key_slot.id = session.key_slot_id
  LEFT JOIN parking_spots AS spot
    ON spot.organization_id = session.organization_id
   AND spot.location_id = session.location_id AND spot.id = session.parking_spot_id
  LEFT JOIN parking_zones AS zone
    ON zone.organization_id = session.organization_id
   AND zone.location_id = session.location_id AND zone.id = session.parking_zone_id`;
