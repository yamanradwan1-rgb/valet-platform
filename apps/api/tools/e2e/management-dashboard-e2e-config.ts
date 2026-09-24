export const MANAGEMENT_DASHBOARD_E2E = {
  organizations: {
    a: {
      id: "d0600000-0000-4000-8000-000000000001",
      name: "MD06 Organization A",
    },
    b: {
      id: "d0600000-0000-4000-8000-000000000002",
      name: "MD06 Organization B",
    },
  },
  locations: {
    a: {
      id: "d0600000-0000-4000-8000-000000000011",
      organizationId: "d0600000-0000-4000-8000-000000000001",
      name: "MD06 Garage A",
      code: "MD06-A",
    },
    b: {
      id: "d0600000-0000-4000-8000-000000000012",
      organizationId: "d0600000-0000-4000-8000-000000000001",
      name: "MD06 Garage B",
      code: "MD06-B",
    },
    ungranted: {
      id: "d0600000-0000-4000-8000-000000000013",
      organizationId: "d0600000-0000-4000-8000-000000000001",
      name: "MD06 Ungranted Garage",
      code: "MD06-U",
    },
    foreign: {
      id: "d0600000-0000-4000-8000-000000000021",
      organizationId: "d0600000-0000-4000-8000-000000000002",
      name: "MD06 Foreign Garage",
      code: "MD06-F",
    },
  },
  users: {
    companyAdmin: staff("101", "201", "md06-ca@valet.test", "ORG_ADMIN", "a"),
    conflictAdmin: staff("102", "202", "md06-conflict@valet.test", "ORG_ADMIN", "a"),
    exportAdmin: staff("103", "203", "md06-export@valet.test", "ORG_ADMIN", "a"),
    authorityAdmin: staff("110", "211", "md06-authority@valet.test", "ORG_ADMIN", "a"),
    locationManager: staff("104", "204", "md06-lm@valet.test", "LOCATION_MANAGER", "a"),
    supervisor: staff("105", "205", "md06-supervisor@valet.test", "VALET_SUPERVISOR", "a"),
    employee: staff("106", "206", "md06-employee@valet.test", "VALET_EMPLOYEE", "a"),
    disabled: staff("107", "207", "md06-disabled@valet.test", "VALET_EMPLOYEE", "a"),
    foreignManager: staff("108", "208", "md06-foreign-lm@valet.test", "LOCATION_MANAGER", "b"),
    multiAdminA: staff("109", "209", "md06-multi-ca@valet.test", "ORG_ADMIN", "a"),
    multiAdminB: staff("109", "210", "md06-multi-ca@valet.test", "ORG_ADMIN", "b"),
  },
  shifts: {
    supervisor: "d0600000-0000-4000-8000-000000000301",
    employee: "d0600000-0000-4000-8000-000000000302",
  },
  contact: {
    customerId: "d0600000-0000-4000-8000-000000000501",
    vehicleId: "d0600000-0000-4000-8000-000000000502",
    sessionId: "d0600000-0000-4000-8000-000000000503",
    displayName: "MD06 Sensitive Contact",
    phone: "+962790000606",
  },
  operations: {
    custody: {
      keySlotCode: "MD06-K1",
      keySlotId: "d0600000-0000-4000-8000-000000000603",
      sessionId: "d0600000-0000-4000-8000-000000000601",
      vehicleId: "d0600000-0000-4000-8000-000000000602",
    },
    guest: {
      rawToken: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      sessionId: "d0600000-0000-4000-8000-000000000611",
      vehicleId: "d0600000-0000-4000-8000-000000000612",
    },
  },
  preEnrolledSecret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
  preEnrolledFactors: {
    conflictAdmin: "d0600000-0000-4000-8000-000000000401",
    exportAdmin: "d0600000-0000-4000-8000-000000000402",
    multiAdmin: "d0600000-0000-4000-8000-000000000403",
    authorityAdmin: "d0600000-0000-4000-8000-000000000404",
  },
} as const;

function staff(
  userSuffix: string,
  membershipSuffix: string,
  email: string,
  role: "ORG_ADMIN" | "LOCATION_MANAGER" | "VALET_SUPERVISOR" | "VALET_EMPLOYEE",
  organization: "a" | "b",
) {
  return {
    userId: `d0600000-0000-4000-8000-000000000${userSuffix}`,
    membershipId: `d0600000-0000-4000-8000-000000000${membershipSuffix}`,
    email,
    role,
    organization,
  } as const;
}

export function assertManagementDashboardE2eTarget(databaseUrl: string): URL {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Management Dashboard E2E provisioning requires NODE_ENV=test.");
  }
  if (process.env.E2E_FIXTURE_CONFIRM !== "management-dashboard-e2e") {
    throw new Error("Management Dashboard E2E provisioning confirmation is missing.");
  }
  const url = new URL(databaseUrl);
  if (!new Set(["127.0.0.1", "::1", "localhost"]).has(url.hostname)) {
    throw new Error("Management Dashboard E2E provisioning refuses a remote database.");
  }
  const name = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!process.env.E2E_APPROVED_DATABASE || name !== process.env.E2E_APPROVED_DATABASE) {
    throw new Error("Database name is not explicitly approved for Management Dashboard E2E.");
  }
  if (/prod(uction)?/i.test(name)) {
    throw new Error("Management Dashboard E2E provisioning refuses production.");
  }
  return url;
}
