const operational = "/v1/staff/shifts/presence";
const company = "/v1/staff/management/organizations/[^/]+/shift-presence";
const location = `(?:${company}/locations/[^/]+|/v1/staff/dashboard/locations/[^/]+/configuration/shift-presence)`;
const route = (
  method: string,
  operation: string,
  prefix: string,
  suffix: string,
) => ({ method, operation, path: new RegExp(`^${prefix}${suffix}$`) });

export const presenceOperationRoutes = [
  route("POST", "PRESENCE_CHALLENGE_ISSUE", operational, "/challenges"),
  route("GET", "PRESENCE_OPERATION_STATUS", operational, "/operations/[^/]+"),
  route(
    "GET",
    "PRESENCE_CHALLENGE_READ",
    operational,
    "/operations/[^/]+/challenge",
  ),
  route(
    "POST",
    "PRESENCE_EXCEPTION_REQUEST",
    operational,
    "/operations/[^/]+/exception",
  ),
  route("GET", "PRESENCE_EXCEPTION_STATUS", operational, "/exceptions/[^/]+"),
  route("GET", "PRESENCE_COMPANY_POLICY_READ", company, "/policy"),
  route("PUT", "PRESENCE_COMPANY_POLICY_SET", company, "/policy/default"),
  route("GET", "PRESENCE_COMPANY_RESULT", company, "/results/[^/]+"),
  route("GET", "PRESENCE_LOCATION_POLICY_READ", location, "/policy"),
  route("PUT", "PRESENCE_LOCATION_POLICY_SET", location, "/policy/override"),
  route(
    "POST",
    "PRESENCE_LOCATION_POLICY_CLEAR",
    location,
    "/policy/override/clear",
  ),
  route("GET", "PRESENCE_READINESS_READ", location, "/readiness"),
  route("GET", "PRESENCE_ZONE_LIST", location, "/zones"),
  route("GET", "PRESENCE_ZONE_READ", location, "/zones/[^/]+"),
  route("POST", "PRESENCE_ZONE_CREATE", location, "/zones"),
  route("PUT", "PRESENCE_ZONE_UPDATE", location, "/zones/[^/]+"),
  route("GET", "PRESENCE_EXCEPTION_LIST", location, "/exceptions"),
  route(
    "GET",
    "PRESENCE_EXCEPTION_MANAGEMENT_READ",
    location,
    "/exceptions/[^/]+",
  ),
  route(
    "POST",
    "PRESENCE_EXCEPTION_APPROVE",
    location,
    "/exceptions/[^/]+/approve",
  ),
  route(
    "POST",
    "PRESENCE_EXCEPTION_REJECT",
    location,
    "/exceptions/[^/]+/reject",
  ),
  route("GET", "PRESENCE_MANAGEMENT_RESULT", location, "/results/[^/]+"),
] as const;
