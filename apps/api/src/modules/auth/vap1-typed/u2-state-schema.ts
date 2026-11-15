import { type U2FieldSpec } from "./u2-record";

export interface U2GroupSchema {
  readonly attributes: readonly U2FieldSpec[];
  readonly keyIndices: readonly number[];
  /** 1-based final field; SHA256(record of every preceding field). */
  readonly derivedDigestId?: number;
}

const uuid = { type: "uuid" } as const;
const nullableUuid = { type: "uuid", nullable: true } as const;
const u32 = { type: "u32" } as const;
const u64 = { type: "u64" } as const;
const nullableU64 = { type: "u64", nullable: true } as const;
const digest = { type: "sha256" } as const;
const nullableDigest = { type: "sha256", nullable: true } as const;
const bool = { type: "bool" } as const;
const text = { type: "utf8", maxUtf8Bytes: 256 } as const;
const nullableBytes = { type: "bytes", nullable: true, lengths: [17, 49] } as const;
const userStatus = { type: "utf8", enumLabels: ["PENDING", "ACTIVE", "DISABLED"] } as const;
const organizationStatus = { type: "utf8", enumLabels: ["ACTIVE", "INACTIVE"] } as const;
const membershipStatus = { type: "utf8", enumLabels: ["PENDING", "ACTIVE", "INACTIVE"] } as const;
const membershipRole = {
  type: "utf8", enumLabels: ["ORG_ADMIN", "LOCATION_MANAGER", "VALET_SUPERVISOR", "VALET_EMPLOYEE"],
} as const;
const factorStatus = { type: "utf8", enumLabels: ["PENDING", "ACTIVE", "RETIRED"] } as const;
const pushStatus = {
  type: "utf8", enumLabels: ["ACTIVE", "DISABLED", "PROVIDER_INVALID", "SUPERSEDED"],
} as const;
const authLimiterScopes = {
  type: "utf8",
  enumLabels: [
    "v1:staff-login-identifier",
    "v1:staff-client-address",
    "v1:mfa-totp-user",
    "v1:mfa-recovery-user",
    "v1:staff-activation-credential",
    "v1:staff-activation-client-address",
    "v1:staff-onboarding-create-organization",
    "v1:staff-onboarding-resend-membership",
    "v1:staff-password-reset-issue-target-user",
    "v1:staff-password-reset-issue-issuer-user",
    "v1:staff-password-reset-issue-organization",
    "v1:staff-password-reset-issue-client-address",
    "v1:staff-password-reset-redeem-client-address",
    "v1:staff-password-reset-redeem-credential",
  ],
} as const;

/**
 * U2 §8.0a group fields 0005..0020 and all class-specific fixed-order records.
 * Group 0005 matches the 13 object kinds in private migration 113.
 * Empty enum registries still HOLD unresolved legacy classifications.
 */
export const U2_STATE_GROUPS: Readonly<Record<number, U2GroupSchema>> = {
  // audience, object_kind, key, disposition, version, epoch, digest, parent_key?
  5: {
    attributes: [
      text,
      { type: "utf8", enumLabels: [
        "USER", "ORGANIZATION", "ENTITLEMENT", "MEMBERSHIP", "LOCATION", "GRANT",
        "SESSION", "REFRESH", "FACTOR", "RECOVERY_SET", "INVITATION",
        "PASSWORD_RESET", "PUSH_REGISTRATION",
      ] },
      { type: "bytes", lengths: [17, 49] },
      { type: "utf8", enumLabels: ["ADMIT", "HOLD", "RETIRE"] },
      u64, u64, digest, nullableBytes,
    ],
    keyIndices: [0, 1, 2],
  },
  // user, normalized_email, status, PHC hash?, version digest
  6: {
    attributes: [uuid, text, userStatus, nullableDigest, digest],
    keyIndices: [0],
    derivedDigestId: 5,
  },
  // organization, status, authority version digest
  7: {
    attributes: [uuid, organizationStatus, digest],
    keyIndices: [0],
    derivedDigestId: 3,
  },
  // organization, dashboard access, commercial digest
  8: {
    attributes: [uuid, bool, digest],
    keyIndices: [0],
    derivedDigestId: 3,
  },
  // org, membership, user, role, status, stored_version?, role digest
  9: {
    attributes: [uuid, uuid, uuid, membershipRole, membershipStatus, nullableU64, digest],
    keyIndices: [0, 1, 2],
    derivedDigestId: 7,
  },
  // org, location, status, accepting_intake, updated_at?, config digest
  10: {
    attributes: [uuid, uuid, organizationStatus, bool, nullableU64, digest],
    keyIndices: [0, 1],
    derivedDigestId: 6,
  },
  // org, membership, location, grant digest
  11: {
    attributes: [uuid, uuid, uuid, digest],
    keyIndices: [0, 1, 2],
    derivedDigestId: 4,
  },
  // user, session, access_hash_digest, expiries, revoke?, MFA?, assurance?, activity?
  12: {
    attributes: [
      uuid, uuid, digest, u64, u64, nullableU64, nullableUuid, nullableU64, nullableU64,
    ],
    keyIndices: [0, 1],
  },
  // session, credential, generation, verifier, consume?, successor?, revoke?
  13: {
    attributes: [uuid, uuid, u64, digest, nullableU64, nullableUuid, nullableU64],
    keyIndices: [0, 1, 2],
  },
  // user, factor, state, initiating_session?, seed digest, step?, generation
  14: {
    attributes: [uuid, uuid, factorStatus, nullableUuid, digest, nullableU64, u64],
    keyIndices: [0, 1],
  },
  // factor, code, generation, slot, selector digest, verifier digest, consumed?
  15: {
    attributes: [uuid, uuid, u64, u32, digest, digest, nullableU64],
    keyIndices: [0, 1, 2, 3],
  },
  // owner, credential, kind, generation, verifier, expiry, consume?, issuer?
  16: {
    attributes: [
      uuid, uuid,
      { type: "utf8", enumLabels: [] }, // Credential-kind labels unresolved in U2.
      u64, digest, u64, nullableU64, nullableUuid,
    ],
    keyIndices: [0, 1, 3],
  },
  // user, session, registration, state, token digest?, terminal?
  17: {
    attributes: [uuid, uuid, uuid, pushStatus, nullableDigest, nullableU64],
    keyIndices: [0, 1, 2],
  },
  // org, shift, location, membership, status, started, ended?, closure?, blocker
  18: {
    attributes: [
      uuid, uuid, uuid, uuid,
      { type: "utf8", enumLabels: ["ACTIVE", "ENDED"] },
      u64, nullableU64, nullableUuid, bool,
    ],
    keyIndices: [0, 1],
  },
  // reservation, scope, digest, reservation state, bound operation
  19: {
    attributes: [
      uuid,
      authLimiterScopes,
      digest,
      { type: "utf8", enumLabels: ["PENDING", "COUNTED", "IGNORED"] },
      uuid,
    ],
    keyIndices: [0],
  },
  // operator case, approval digest, controlled operation, prior admission version?
  20: {
    attributes: [uuid, digest, uuid, nullableU64],
    keyIndices: [0],
  },
};
