export class DashboardOverviewError extends Error {
  constructor(
    readonly code: "AUTHORIZATION_DENIED" | "REPORT_EXPORT_TOO_LARGE",
  ) {
    super(
      code === "AUTHORIZATION_DENIED"
        ? "The requested resource is not available."
        : "Report export exceeds allowed size.",
    );
    this.name = "DashboardOverviewError";
  }
}

export function assertAuthorized(scope: unknown): asserts scope {
  if (scope === null) {
    throw new DashboardOverviewError("AUTHORIZATION_DENIED");
  }
}

export function assertExportWithinBounds(condition: boolean): void {
  if (!condition) {
    throw new DashboardOverviewError("REPORT_EXPORT_TOO_LARGE");
  }
}
