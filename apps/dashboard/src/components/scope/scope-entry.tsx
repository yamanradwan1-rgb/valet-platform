"use client";

import type { ManagementOrganization } from "@valet/contracts";

import { Button } from "../presentation/button";
import { Panel } from "../presentation/panel";
import {
  allowsCompanyAdminAllLocations,
  canSelectScopeLocation,
} from "./scope-entry-route-policy";
import type { ScopeEntryAuthority, ScopeEntryProps } from "./scope-entry-types";
import { useScopeEntryController } from "./use-scope-entry-controller";

export function ScopeEntry(props: ScopeEntryProps) {
  const controller = useScopeEntryController(props);
  const { labels } = props;
  const hasAnyAuthority =
    controller.companyAdminOrganizations.items.length > 0 ||
    controller.locationManagerOrganizations.items.length > 0 ||
    controller.supervisorScopes.length > 0;

  return (
    <div className="stack" aria-busy={controller.pending}>
      <div>
        <p className="eyebrow">VAYLET</p>
        <h1>{labels.title}</h1>
      </div>
      {controller.error ? (
        <Panel>
          <div className="stack" role="alert">
            <p>{labels.loadError}</p>
            <Button disabled={controller.pending} onClick={controller.retry} type="button" variant="secondary">
              {labels.retry}
            </Button>
          </div>
        </Panel>
      ) : null}
      <OrganizationSection
        authority="COMPANY_ADMIN"
        label={labels.companyAdmin}
        organizations={controller.companyAdminOrganizations.items}
        nextCursor={controller.companyAdminOrganizations.nextCursor}
        pending={controller.pending}
        activeOrganizationId={controller.activeOrganization?.authority === "COMPANY_ADMIN" ? controller.activeOrganization.organization.organizationId : null}
        loadMoreLabel={labels.loadMore}
        noneLabel={labels.noneAvailable}
        onLoadMore={() => void controller.loadMoreOrganizations("COMPANY_ADMIN")}
        onSelect={(organization) => void controller.selectOrganization("COMPANY_ADMIN", organization)}
      />
      <OrganizationSection
        authority="LOCATION_MANAGER"
        label={labels.locationManager}
        organizations={controller.locationManagerOrganizations.items}
        nextCursor={controller.locationManagerOrganizations.nextCursor}
        pending={controller.pending}
        activeOrganizationId={controller.activeOrganization?.authority === "LOCATION_MANAGER" ? controller.activeOrganization.organization.organizationId : null}
        loadMoreLabel={labels.loadMore}
        noneLabel={labels.noneAvailable}
        onLoadMore={() => void controller.loadMoreOrganizations("LOCATION_MANAGER")}
        onSelect={(organization) => void controller.selectOrganization("LOCATION_MANAGER", organization)}
      />
      <Panel>
        <section className="stack" aria-label={labels.supervisor}>
          <h2>{labels.supervisor}</h2>
          {controller.supervisorScopes.length === 0 ? <p className="muted">{labels.noneAvailable}</p> : (
            <div className="stack">
              {controller.supervisorScopes.map((scope) => (
                <Button
                  disabled={controller.pending}
                  key={`${scope.membershipId}:${scope.location.locationId}`}
                  onClick={() => controller.selectSupervisorScope(scope)}
                  type="button"
                  variant="secondary"
                >
                  {scope.organization.name} · {scope.location.name}
                </Button>
              ))}
            </div>
          )}
        </section>
      </Panel>
      {controller.activeOrganization ? (
        <Panel>
          <section className="stack" aria-label={labels.locations}>
            <h2>{controller.activeOrganization.organization.name} · {labels.locations}</h2>
            {controller.activeOrganization.authority === "COMPANY_ADMIN" &&
            controller.commercialUnavailableOrganizationId === controller.activeOrganization.organization.organizationId ? (
              <p className="muted" role="status">
                {props.accessRequirement === "DASHBOARD" ||
                props.accessRequirement === "EMERGENCY_TASKS" ||
                props.accessRequirement === "FOUNDATION_ENTRY" ||
                props.accessRequirement === "LOCATION_MAPS"
                  ? labels.dashboardAccessUnavailable
                  : labels.featureAccessUnavailable}
              </p>
            ) : controller.activeOrganization.authority === "COMPANY_ADMIN" &&
              allowsCompanyAdminAllLocations(props.accessRequirement) ? (
              <Button
                disabled={controller.pending}
                onClick={() => void controller.selectCompanyAdminScope(null)}
                type="button"
                variant="secondary"
              >
                {labels.allLocations}
              </Button>
            ) : null}
            {controller.commercialUnavailableOrganizationId === controller.activeOrganization.organization.organizationId ? null : controller.locations.items.length === 0 ? <p className="muted">{labels.noneAvailable}</p> : (
              <div className="stack">
                {controller.locations.items.map((location) => {
                  const authority = controller.activeOrganization?.authority;
                  const disabled = controller.pending || (
                    authority !== undefined &&
                    !canSelectScopeLocation(authority, props.accessRequirement, location)
                  );
                  return (
                    <Button
                      disabled={disabled}
                      key={location.locationId}
                      onClick={() => {
                        if (controller.activeOrganization?.authority === "COMPANY_ADMIN") {
                          void controller.selectCompanyAdminScope(location);
                        } else {
                          controller.selectLocationManagerScope(location);
                        }
                      }}
                      type="button"
                      variant="secondary"
                    >
                      {location.name}{location.status === "INACTIVE" ? ` · ${labels.inactiveHistorical}` : ""}
                    </Button>
                  );
                })}
              </div>
            )}
            {controller.commercialUnavailableOrganizationId === controller.activeOrganization.organization.organizationId ? null : controller.locations.nextCursor ? (
              <Button disabled={controller.pending} onClick={() => void controller.loadMoreLocations()} type="button" variant="quiet">
                {labels.loadMore}
              </Button>
            ) : null}
          </section>
        </Panel>
      ) : null}
      {controller.pending && !hasAnyAuthority ? <p role="status">{labels.loading}</p> : null}
    </div>
  );
}

function OrganizationSection({
  authority,
  label,
  organizations,
  nextCursor,
  pending,
  activeOrganizationId,
  loadMoreLabel,
  noneLabel,
  onLoadMore,
  onSelect,
}: {
  readonly authority: ScopeEntryAuthority;
  readonly label: string;
  readonly organizations: readonly ManagementOrganization[];
  readonly nextCursor: string | null;
  readonly pending: boolean;
  readonly activeOrganizationId: string | null;
  readonly loadMoreLabel: string;
  readonly noneLabel: string;
  readonly onLoadMore: () => void;
  readonly onSelect: (organization: ManagementOrganization) => void;
}) {
  return (
    <Panel>
      <section className="stack" aria-label={label} data-authority={authority}>
        <h2>{label}</h2>
        {organizations.length === 0 ? <p className="muted">{noneLabel}</p> : (
          <div className="stack">
            {organizations.map((organization) => (
              <Button
                aria-pressed={activeOrganizationId === organization.organizationId}
                disabled={pending}
                key={organization.organizationId}
                onClick={() => onSelect(organization)}
                type="button"
                variant={activeOrganizationId === organization.organizationId ? "primary" : "secondary"}
              >
                {organization.name}
              </Button>
            ))}
          </div>
        )}
        {nextCursor ? (
          <Button disabled={pending} onClick={onLoadMore} type="button" variant="quiet">
            {loadMoreLabel}
          </Button>
        ) : null}
      </section>
    </Panel>
  );
}
