export class DashboardOverviewError extends Error {
  constructor(readonly code: "AUTHORIZATION_DENIED") {
    super("The requested resource is not available.");
    this.name = "DashboardOverviewError";
  }
}

export function assertAuthorized(scope: unknown): asserts scope {
  if (scope === null) {
    throw new DashboardOverviewError("AUTHORIZATION_DENIED");
  }
}
