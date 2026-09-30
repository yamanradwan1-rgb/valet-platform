"use client";

import Link from "next/link";
import { useState } from "react";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import type { DashboardRouteAccessRequirement } from "../../lib/scope/dashboard-commercial-access";
import { Button } from "../presentation/button";
import { ScopeEntry } from "../scope";
import { AccountSecurityStandalone } from "../security";
import { useAccountSecurityAccess } from "../security/account-security-access-provider";
import { useSelectedScope } from "./selected-scope-provider";
import { StandaloneFoundationPanel } from "./standalone-foundation-panel";

export function UnselectedScopeFoundation(props: {
  readonly accessRequirement: DashboardRouteAccessRequirement;
  readonly api: DashboardApiClient;
  readonly identityGeneration: number;
  readonly logoutPending: boolean;
  readonly onLogout: () => Promise<void>;
  readonly sessionGeneration: number;
}) {
  const { t } = useDashboardLocale();
  const securityAccess = useAccountSecurityAccess();
  const { selectScope } = useSelectedScope();
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaGeneration, setMfaGeneration] = useState(0);
  const generationKey = `${props.identityGeneration}:${props.sessionGeneration}`;

  return (
    <StandaloneFoundationPanel>
      {mfaRequired ? (
        <AccountSecurityStandalone
          generationKey={generationKey}
          key={generationKey}
          onAssured={() => {
            setMfaRequired(false);
            setMfaGeneration((value) => value + 1);
          }}
        />
      ) : null}
      <ScopeEntry
        api={props.api}
        accessRequirement={props.accessRequirement}
        identityGeneration={props.identityGeneration}
        sessionGeneration={props.sessionGeneration}
        key={mfaGeneration}
        labels={{
          allLocations: t("allLocations"), companyAdmin: t("companyAdmin"),
          dashboardAccessUnavailable: t("dashboardAccessUnavailable"),
          featureAccessUnavailable: t("unavailable"), inactiveHistorical: t("inactiveHistorical"),
          loadError: t("loadError"), loadMore: t("loadMore"), loading: t("loading"),
          locationManager: t("locationManager"), locations: t("locations"),
          noneAvailable: t("noEligibleScope"), retry: t("retry"),
          supervisor: t("supervisor"), title: t("chooseScope"),
        }}
        onMfaRequired={() => setMfaRequired(true)}
        onSelect={selectScope}
      />
      <div className="scope-line">
        {securityAccess.snapshot.status === "eligible" ? (
          <Link className="nav-link foundation-link" href="/security">{t("security")}</Link>
        ) : null}
        <Button disabled={props.logoutPending} onClick={() => void props.onLogout()} type="button" variant="quiet">
          {t("logout")}
        </Button>
      </div>
    </StandaloneFoundationPanel>
  );
}
