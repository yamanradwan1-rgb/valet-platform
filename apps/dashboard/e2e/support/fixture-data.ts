export const E2E_IDS = {
  orgA: "11111111-1111-4111-8111-111111111111",
  orgB: "22222222-2222-4222-8222-222222222222",
  locationA: "33333333-3333-4333-8333-333333333333",
  locationB: "44444444-4444-4444-8444-444444444444",
  membership: "55555555-5555-4555-8555-555555555555",
  shift: "66666666-6666-4666-8666-666666666666",
  factor: "77777777-7777-4777-8777-777777777777",
} as const;

export const ORG_A = {
  organizationId: E2E_IDS.orgA,
  name: "Acme Valet",
  timezone: "Asia/Amman",
} as const;

export const ORG_B = {
  organizationId: E2E_IDS.orgB,
  name: "Bravo Valet",
  timezone: "Asia/Amman",
} as const;

export const LOCATION_A = {
  locationId: E2E_IDS.locationA,
  name: "Main Garage",
  code: "MAIN",
  status: "ACTIVE" as const,
  timezone: "Asia/Amman",
  currency: "JOD",
};

export const LOCATION_B = {
  locationId: E2E_IDS.locationB,
  name: "North Garage",
  code: "NORTH",
  status: "ACTIVE" as const,
  timezone: "Asia/Amman",
  currency: "JOD",
};

export const RECOVERY_CODE = `vmr1-${"a".repeat(11)}-${"b".repeat(27)}`;

export function authPayload(character: string) {
  return {
    accessToken: `vsa1.${character.repeat(43)}`,
    tokenType: "Bearer",
    accessExpiresAt: "2099-01-01T00:00:00.000Z",
    sessionExpiresAt: "2099-01-02T00:00:00.000Z",
  };
}

export function subscriptionState() {
  return {
    planCode: "E2E",
    status: "ACTIVE",
    entitlements: {
      dashboardAccess: true,
      reportExports: true,
      basicBranding: true,
    },
  };
}

export function enrollmentPayload() {
  return {
    factorId: E2E_IDS.factor,
    provisioning: {
      secretBase32: "A".repeat(32),
      issuer: "VAYLET",
      algorithm: "SHA1",
      digits: 6,
      periodSeconds: 30,
    },
  };
}

export function recoveryCodes(): string[] {
  return Array.from(
    { length: 10 },
    (_, index) => `vmr1-${String(index).padStart(11, "a")}-${"b".repeat(27)}`,
  );
}

export type Organization = typeof ORG_A;
export type Location = typeof LOCATION_A;
