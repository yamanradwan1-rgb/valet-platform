import type { FoundationLocale } from "../foundation/foundation-locale";
import { getNativeEmployeeDictionary } from "../i18n/native-employee-dictionary";

export interface NativeTasksCopy {
  readonly acceptTask: string;
  readonly acceptAndPark: string;
  readonly actionFailed: string;
  readonly accessChanged: string;
  readonly age: string;
  readonly activeShift: string;
  readonly ambiguousShifts: string;
  readonly claimParking: string;
  readonly claimRetrieval: string;
  readonly empty: string;
  readonly error: string;
  readonly dismiss: string;
  readonly loading: string;
  readonly otherStaff: string;
  readonly newVehicle: string;
  readonly now: string;
  readonly openRetrieval: string;
  readonly overrideHandoff: string;
  readonly parking: string;
  readonly queue: string;
  readonly noShift: string;
  readonly processing: string;
  readonly continueParking: string;
  readonly retrieval: string;
  readonly retrievalAlertBody: string;
  readonly retrievalAlertTitle: string;
  readonly requested: string;
  readonly status: string;
  readonly statusAccepted: string;
  readonly statusAssigned: string;
  readonly statusInProgress: string;
  readonly statusQueued: string;
  readonly startParking: string;
  readonly continueRetrieval: string;
  readonly tasks: string;
}

export function getNativeTasksCopy(locale: FoundationLocale): NativeTasksCopy {
  const d = getNativeEmployeeDictionary(locale);
  return {
    acceptTask: d.acceptTask,
    acceptAndPark: d.acceptAndPark,
    actionFailed: d.operationFailed,
    accessChanged: d.assignedOtherError,
    age: d.ageLabel,
    activeShift: d.shiftActive,
    ambiguousShifts: d.ambiguousShiftDetail,
    claimParking: d.claimAndPark,
    claimRetrieval: d.acceptTask,
    dismiss: d.dismissAction,
    empty: d.queueLabel,
    error: d.operationFailed,
    loading: d.loadingContext,
    noShift: d.noActiveShift,
    otherStaff: d.otherStaff,
    newVehicle: d.newVehicle,
    now: d.now,
    openRetrieval: d.openRetrieval,
    overrideHandoff: d.overrideHandoff,
    parking: d.parkingState,
    queue: d.queueLabel,
    processing: d.processing,
    continueParking: d.continueParking,
    retrieval: d.retrievalState,
    retrievalAlertBody: d.retrievalAlertBody,
    retrievalAlertTitle: d.retrievalAlertTitle,
    requested: d.requestedState,
    status: d.statusLabel,
    statusAccepted: d.activeState,
    statusAssigned: d.assigned,
    statusInProgress: d.inProgressState,
    statusQueued: d.queuedState,
    startParking: d.startParkingAction,
    continueRetrieval: d.continueRetrieval,
    tasks: d.tasksTitle,
  };
}
