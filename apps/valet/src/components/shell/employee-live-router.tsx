"use client";

import type { JSX } from "react";

import type { Screen } from "../../types/employee-ui";
import { CheckInFlow } from "../screens/check-in-flow";
import { ParkingFlow } from "../screens/parking-flow";
import { IncidentFlow } from "../screens/incident-flow";
import { RetrievalFlow } from "../screens/retrieval-flow";
import { TaskQueueScreen } from "../screens/task-queue-screen";
import type { StartParkingPayload } from "../../features/check-in";
import type { ActiveParkingSession } from "../../features/parking";
import type { ResolvedOperationalScope } from "../../features/staff-operational-context";
import type {
  ActiveIncidentTarget,
  ActiveParkingTarget,
  ActiveRetrievalTarget,} from "./employee-workspace";

export interface EmployeeLiveRouterProps {
  readonly activeScope: ResolvedOperationalScope;
  readonly effectiveScreen: Screen;
  readonly incidentTarget: ActiveIncidentTarget | null;
  readonly onOpenIncident: (sessionId: string, from: Screen) => void;

  readonly nav: (s: Screen) => void;
  readonly onAuthorizationLoss: () => Promise<void>;
  readonly onParkingComplete: () => void;
  readonly onRetrievalComplete: () => void;
  readonly onSelectParkingTask: (target: ActiveParkingTarget) => void;
  readonly onSelectRetrievalTask: (target: ActiveRetrievalTarget) => void;
  readonly onStartParkingSuccess: (payload: StartParkingPayload) => void;
  readonly parkingPayload: StartParkingPayload | null;
  readonly parkingTarget: ActiveParkingTarget | null;
  readonly retrievalTarget: ActiveRetrievalTarget | null;
}

export function EmployeeLiveRouter({
  activeScope,
  effectiveScreen,

  incidentTarget,
  onOpenIncident,

  nav,

  onAuthorizationLoss,
  onParkingComplete,
  onRetrievalComplete,
  onSelectParkingTask,
  onSelectRetrievalTask,
  onStartParkingSuccess,
  parkingPayload,
  parkingTarget,
  retrievalTarget,
}: EmployeeLiveRouterProps): JSX.Element {
  switch (effectiveScreen) {
    case "check-in":
      return (
        <CheckInFlow
          locationId={activeScope.locationId}
          membershipId={activeScope.membershipId}
          mode="live"
          nav={nav}
          onAuthorizationLoss={onAuthorizationLoss}
          onStartParkingSuccess={onStartParkingSuccess}
        />
      );
    case "parking": {
      const initialSession: ActiveParkingSession | null = parkingPayload
        ? {
            keySlotCode: parkingPayload.keySlotCode,
            locationId: parkingPayload.locationId,
            parkedAt: null,
            parkingSpotCode: null,
            parkingStartedAt: parkingPayload.parkingStartedAt,
            parkingZoneCode: null,
            sessionId: parkingPayload.sessionId,
            sessionVersion: parkingPayload.sessionVersion,
            taskId: parkingPayload.taskId,
            taskVersion: parkingPayload.taskVersion,
            vehicle: parkingPayload.vehicle,
          }
        : null;
      return (
        <ParkingFlow
          initialSession={initialSession}
          mode="live"
          sessionId={parkingTarget?.sessionId ?? parkingPayload?.sessionId}
          taskId={parkingTarget?.taskId ?? parkingPayload?.taskId}
          taskVersion={
            parkingTarget?.taskVersion ?? parkingPayload?.taskVersion
          }
          nav={nav}
          onAuthorizationLoss={onAuthorizationLoss}
          onComplete={onParkingComplete}
          onReportIssue={() => {
            const sessionId =
              parkingTarget?.sessionId ?? parkingPayload?.sessionId;
            if (sessionId !== undefined && sessionId !== null) {
              onOpenIncident(sessionId, "parking");
            }
          }}
        />
      );
    }
    case "incident":
      return incidentTarget === null ? (
        <div />
      ) : (
        <IncidentFlow
          mode="live"
          nav={nav}
          returnScreen={incidentTarget.returnScreen}
          sessionId={incidentTarget.sessionId}
        />
      );
    case "retrieval":
      return (
        <RetrievalFlow
          currentAssigneeMembershipId={
            retrievalTarget?.currentAssigneeMembershipId
          }
          membershipId={activeScope.membershipId}
          mode="live"
          role={activeScope.role}
          sessionId={retrievalTarget?.sessionId}
          taskId={retrievalTarget?.taskId}
          taskStatus={retrievalTarget?.taskStatus}
          taskVersion={retrievalTarget?.taskVersion}
          nav={nav}
          onAuthorizationLoss={onAuthorizationLoss}
          onComplete={onRetrievalComplete}
          onOpenIncident={(id: string) => onOpenIncident(id, "retrieval")}
        />      );
    case "task-queue":
    default:
      return (
        <TaskQueueScreen
          mode="live"
          nav={nav}
          locationId={activeScope.locationId}
          locationName={activeScope.locationName}
          shiftStartedAt={activeScope.shiftStartedAt}
          membershipId={activeScope.membershipId}
          role={activeScope.role}
          onAuthorizationLoss={onAuthorizationLoss}
          onSelectParkingTask={onSelectParkingTask}
          onSelectRetrievalTask={onSelectRetrievalTask}
          onStartParkingSuccess={onStartParkingSuccess}
        />
      );
  }
}
