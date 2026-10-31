"use client";

import type { ManagementLocation, TaskOverviewEntry } from "@valet/contracts";
import { useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { RouteHistorySection } from "./route-history/route-section";
import { TaskDrawer } from "./task-drawer";
import { canOfferEmergencyTakeover } from "./emergency-tasks-visibility";
import { useEmergencyActionEligibility } from "./use-emergency-action-eligibility";

export function EmergencyTaskDrawer(props: {
  readonly api: DashboardApiClient;
  readonly item: TaskOverviewEntry;
  readonly locale: "en" | "ar";
  readonly location: ManagementLocation;
  readonly help?: ReactNode;
  readonly scopeKey: string;
  readonly role: "COMPANY_ADMIN" | "LOCATION_MANAGER" | "SUPERVISOR";
  readonly onClose: () => void;
  readonly onTakeover: () => void;
}) {
  const onCloseRef = useRef(props.onClose);
  useEffect(() => {
    onCloseRef.current = props.onClose;
  }, [props.onClose]);
  // OperationsDrawer focuses its Close button whenever onClose changes.
  // Keep that handler stable while the sibling takeover dialog is mounted.
  const closeDrawer = useCallback(() => onCloseRef.current(), []);
  const eligible = useEmergencyActionEligibility({
    api: props.api,
    taskId: props.item.taskId,
    updatedAt: props.item.updatedAt,
    scopeKey: props.scopeKey,
    enabled: canOfferEmergencyTakeover(props.role, props.item),
  });
  return (
    <TaskDrawer
      help={props.help}
      item={props.item}
      locale={props.locale}
      location={props.location}
      routeHistory={
        <RouteHistorySection
          key={`${props.scopeKey}:${props.item.taskId}:${props.item.status}`}
          api={props.api}
          item={props.item}
          location={props.location}
          scopeKey={props.scopeKey}
          role={props.role}
        />
      }
      onClose={closeDrawer}
      {...(eligible ? { onEmergencyTakeover: props.onTakeover } : {})}
    />
  );
}
