"use client";

import { useState } from "react";

import { PhysicalResourcesPanel } from "../../administration/physical-resources/physical-resources-panel";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import localStyles from "../accountability.module.css";
import { selectedOperationsLocation } from "../operations-location";
import { operationsCopy } from "../operations-copy";
import { OperationsPage, styles } from "../operations-ui";
import { useOperationsContext } from "../use-operations-context";
import { KeysOperationalView } from "./keys-operational-view";
import {
  KeysWorkspaceTabs,
  type KeysWorkspaceView,
} from "./keys-workspace-tabs";

export function KeysPage() {
  const [view, setView] = useState<KeysWorkspaceView>("operational");
  const { dashboard, exactLocation, scope, scopeKey } = useOperationsContext();
  const { locale } = useDashboardLocale();
  const t = operationsCopy(locale);
  const location = selectedOperationsLocation(dashboard.selectedScope);
  const configurationAllowed =
    location !== null &&
    (scope.authority === "COMPANY_ADMIN" ||
      (scope.authority === "LOCATION_MANAGER" && exactLocation));

  return (
    <OperationsPage
      referenceHeader
      subtitle={t.keysSubtitle}
      title={t.keysTitle}
    >
      <KeysWorkspaceTabs
        active={view}
        configurationLabel={t.keysConfiguration}
        label={t.keysTitle}
        onSelect={setView}
        operationalLabel={t.keysOperational}
      />
      <div
        aria-labelledby={`keys-workspace-tab-${view}`}
        className={styles.workspacePanel}
        id={`keys-workspace-panel-${view}`}
        role="tabpanel"
      >
        {view === "operational" ? (
          <KeysOperationalView key={`${scopeKey}:operational`} />
        ) : configurationAllowed && location ? (
          <>
            <div className={localStyles.keyContext}>
              <span>
                <bdi>{location.name}</bdi>
              </span>
              <span>
                {location.status === "ACTIVE" ? t.operational : t.inactive}
              </span>
            </div>
            <PhysicalResourcesPanel
              api={dashboard.api}
              identityGeneration={dashboard.identityGeneration}
              key={`${scopeKey}:physical:${location.locationId}`}
              location={location}
              scopeKey={`${scopeKey}:physical:${location.locationId}`}
            />
          </>
        ) : (
          <div className={`${styles.card} ${styles.state}`}>
            {t.exactLocation}
          </div>
        )}
      </div>
    </OperationsPage>
  );
}
