export const authorityColumnPrivileges = [
  ["users", "last_login_at", true],
  ["users", "updated_at", true],
  ["users", "password_hash", false],
  ["users", "status", false],
  ["organization_memberships", "updated_at", true],
  ["organization_memberships", "role", false],
  ["organization_memberships", "status", false],
  ["organization_memberships", "organization_id", false],
  ["organization_memberships", "user_id", false],
  ["membership_location_access", "created_at", true],
  ["membership_location_access", "organization_id", false],
  ["membership_location_access", "membership_id", false],
  ["membership_location_access", "location_id", false],
] as const;

interface LockIds {
  keySlotId: string;
  locationId: string;
  membershipId: string;
  organizationId: string;
  parkingSpotId: string;
  parkingZoneId: string;
  userId: string;
}

export function runtimeLockQueries(ids: LockIds): Array<[string, string[]]> {
  return [
    [`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [ids.userId]],
    [
      `SELECT id FROM organization_memberships WHERE id = $1 FOR UPDATE`,
      [ids.membershipId],
    ],
    [
      `SELECT membership_id FROM membership_location_access WHERE membership_id = $1 AND location_id = $2 FOR SHARE`,
      [ids.membershipId, ids.locationId],
    ],
    [
      `SELECT id FROM organizations WHERE id = $1 FOR SHARE`,
      [ids.organizationId],
    ],
    [`SELECT id FROM locations WHERE id = $1 FOR SHARE`, [ids.locationId]],
    [`SELECT id FROM key_slots WHERE id = $1 FOR UPDATE`, [ids.keySlotId]],
    [
      `SELECT id FROM parking_spots WHERE id = $1 FOR UPDATE`,
      [ids.parkingSpotId],
    ],
    [
      `SELECT id FROM parking_zones WHERE id = $1 FOR UPDATE`,
      [ids.parkingZoneId],
    ],
  ];
}
