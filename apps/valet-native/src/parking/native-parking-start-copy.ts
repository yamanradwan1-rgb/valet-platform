import type { FoundationLocale } from "../foundation/foundation-locale";
import { getNativeEmployeeDictionary } from "../i18n/native-employee-dictionary";

export function getNativeParkingStartCopy(locale: FoundationLocale) {
  const d = getNativeEmployeeDictionary(locale);
  return {
    acceptTask: d.acceptTask,
    acceptedBody: d.parkingTask,
    assignedBody: d.parkingTask,
    back: d.back,
    backToTasks: d.backToQueue,
    checkState: d.retry,
    claimTask: d.claimAndPark,
    conflictBody: d.assignedOtherError,
    conflictTitle: d.connectionIssue,
    loading: d.loadingParking,
    parkingInProgress: d.parkingOperation,
    parkingStartedBody: d.locationActiveForTask,
    startParking: d.startParkingAction,
    startingParking: d.startingParking,
    statusAccepted: d.assigned,
    statusAssigned: d.assigned,
    statusInProgress: d.inProgressState,
    statusQueued: d.queuedState,
    taskTitle: d.parkingTask,
    unknownBody: d.operationFailed,
    unknownTitle: d.connectionIssue,
    unavailableBody: d.operationFailed,
    unavailableTitle: d.cannotResumeParking,
    vehicle: d.vehicle,
    queuedBody: d.queueParkingTask,
  };
}
