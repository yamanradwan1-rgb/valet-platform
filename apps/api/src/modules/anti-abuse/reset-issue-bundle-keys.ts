import type { AntiAbuseKey } from "./anti-abuse-key";
import { STAFF_PASSWORD_RESET_ANTI_ABUSE } from "./anti-abuse-key";
import { parseCanonicalIp } from "./client-address";

type ResetScope = keyof Pick<
  typeof STAFF_PASSWORD_RESET_ANTI_ABUSE,
  "issueTargetUser" | "issueIssuerUser" | "issueOrganization" | "issueClientAddress"
>;

export interface ResetIssueQuotaIdentities {
  readonly targetUserId: string;
  readonly issuerUserId: string;
  readonly organizationId: string;
  // Must originate from TrustedClientAddressResolver, never raw XFF/header.
  readonly trustedClientAddress: string;
}

export interface ResetIssueQuotaKey {
  readonly category: ResetScope;
  readonly key: AntiAbuseKey;
  readonly limit: number;
}

interface KeyDeriver {
  key(scope: AntiAbuseKey["scope"], value: string): AntiAbuseKey;
}

function canonicalUuid(value: string): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new Error("Reset quota identity is not a canonical UUID.");
  }
  return value.toLowerCase();
}

/**
 * Produces the exact four privacy-preserving, fixed-limit R02 keys.
 * It is NOT an admission decision: W2's separately committed private SQL
 * four-key reservation+receipt must lock and admit/replay all keys atomically.
 */
export function resetIssueQuotaKeys(
  deriver: KeyDeriver,
  identities: ResetIssueQuotaIdentities,
): readonly ResetIssueQuotaKey[] {
  const canonicalAddress = parseCanonicalIp(identities.trustedClientAddress)
    .canonical;
  if (canonicalAddress !== identities.trustedClientAddress) {
    throw new Error("Reset quota address must use trusted canonical form.");
  }
  const identityByScope: Record<ResetScope, string> = {
    issueTargetUser: canonicalUuid(identities.targetUserId),
    issueIssuerUser: canonicalUuid(identities.issuerUserId),
    issueOrganization: canonicalUuid(identities.organizationId),
    issueClientAddress: canonicalAddress,
  };
  const categories = [
    "issueTargetUser",
    "issueIssuerUser",
    "issueOrganization",
    "issueClientAddress",
  ] as const;
  return categories.map((category) => {
    const policy = STAFF_PASSWORD_RESET_ANTI_ABUSE[category];
    return {
      category,
      key: deriver.key(policy.scope, identityByScope[category]),
      limit: policy.limit,
    };
  }).sort((a, b) => {
    if (a.key.scope !== b.key.scope) return a.key.scope < b.key.scope ? -1 : 1;
    if (a.key.keyHash === b.key.keyHash) return 0;
    return a.key.keyHash < b.key.keyHash ? -1 : 1;
  });
}
