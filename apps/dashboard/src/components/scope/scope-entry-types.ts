import type {
  ManagementContextResponse,
  ManagementLocation,
  ManagementOrganization,
} from "@valet/contracts";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import type { DashboardRouteAccessRequirement } from "../../lib/scope/dashboard-commercial-access";
import type { SupervisorCandidate } from "../../lib/scope/dashboard-scope";

export type ScopeEntryAuthority = "COMPANY_ADMIN" | "LOCATION_MANAGER";

export interface ScopeEntryLabels {
  readonly title: string;
  readonly companyAdmin: string;
  readonly locationManager: string;
  readonly supervisor: string;
  readonly locations: string;
  readonly allLocations: string;
  readonly dashboardAccessUnavailable: string;
  readonly featureAccessUnavailable: string;
  readonly inactiveHistorical: string;
  readonly loadMore: string;
  readonly loading: string;
  readonly noneAvailable: string;
  readonly loadError: string;
  readonly retry: string;
}

export type SelectedDashboardScope =
  | {
      readonly authority: "COMPANY_ADMIN";
      readonly context: ManagementContextResponse;
    }
  | {
      readonly authority: "COMPANY_ADMIN_SUBSCRIPTION";
      readonly organization: ManagementOrganization;
    }
  | {
      readonly authority: "LOCATION_MANAGER";
      readonly organization: ManagementOrganization;
      readonly location: ManagementLocation;
    }
  | {
      readonly authority: "SUPERVISOR";
      readonly context: SupervisorCandidate;
    };

export interface ScopeEntryProps {
  readonly api: DashboardApiClient;
  readonly accessRequirement: DashboardRouteAccessRequirement;
  readonly identityGeneration: number;
  readonly sessionGeneration: number;
  readonly labels: ScopeEntryLabels;
  readonly onMfaRequired: () => void;
  readonly onSelect: (scope: SelectedDashboardScope) => void;
}
