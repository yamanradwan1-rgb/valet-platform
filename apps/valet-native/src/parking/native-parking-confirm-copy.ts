import type { FoundationLocale } from "../foundation/foundation-locale";
import { getNativeEmployeeDictionary } from "../i18n/native-employee-dictionary";

export function getNativeParkingConfirmCopy(locale: FoundationLocale) {
  const d = getNativeEmployeeDictionary(locale);
  return {
    ambiguousBody: d.operationFailed,
    ambiguousTitle: d.connectionIssue,
    back: d.back,
    backToTasks: d.backToQueue,
    checkState: d.retry,
    confirm: d.confirmParked,
    confirming: d.confirming,
    continueLabel: d.continueLabel,
    keySlot: d.keySlot,
    parkedTitle: d.vehicleParkedAndKeyReturned,
    parkingSpot: d.parkingSpot,
    location: d.location,
    noNetwork: d.noNetworkMessage,
    scanAgain: d.scanAgain,
    spotCode: d.spotCode,
    vehicle: d.vehicle,
    zone: d.zone,
    parkingArea: d.parkingArea,
    spot: d.spot,
    done: d.done,
    enterKeySlotCode: d.enterKeySlotCode,
    enterSpotCode: d.enterSpotCode,
    enterSpotManually: d.enterSpotManually,
    parkingConfirmed: d.parkingConfirmed,
    parking: d.parkingState,
    reviewAgain: d.scanAgain,
    slotBody: d.returnKeyAvailable,
    slotConflict: d.keySlotUnavailableRetry,
    spotBody: d.chooseManually,
    spotConflict: d.operationFailed,
    spotTitle: d.parkingSpot,
    stale: d.operationFailed,
    taskTitle: d.confirmParking,
    unavailableBody: d.operationFailed,
    unavailableTitle: d.cannotResumeParking,
  };
}
