import type { EmployeeLocale } from "@valet/employee-client";
import { getNativeEmployeeDictionary } from "../i18n/native-employee-dictionary";

export interface NativeCheckInCopy {
  readonly back: string;
  readonly cancel: string;
  readonly checkServer: string;
  readonly close: string;
  readonly confirmDescription: string;
  readonly confirmPlate: string;
  readonly continueLabel: string;
  readonly continueToCustomer: string;
  readonly continueWithoutRecognition: string;
  readonly country: string;
  readonly locationTrackingParking: string;
  readonly parkingState: string;
  readonly parkingStartFailed: string;
  readonly parkingTask: string;
  readonly startParking: string;
  readonly startingParking: string;
  readonly customerContact: string;
  readonly color: string;
  readonly correctVehicleDetails: string;
  readonly done: string;
  readonly differentCustomer: string;
  readonly detected: string;
  readonly discoveryError: string;
  readonly discoveryErrorTitle: string;
  readonly discoveryTitle: string;
  readonly edit: string;
  readonly enterManually: string;
  readonly enterPlate: string;
  readonly intakeUnknown: string;
  readonly intakeUnknownTitle: string;
  readonly loading: string;
  readonly manualEntry: string;
  readonly enteredPlate: string;
  readonly highConfidence: string;
  readonly multiple: string;
  readonly newVehicle: string;
  readonly noPhone: string;
  readonly noPlate: string;
  readonly noPlateExample: string;
  readonly phone: string;
  readonly make: string;
  readonly model: string;
  readonly notSpecified: string;
  readonly phoneAmbiguous: string;
  readonly savedCustomerStale: string;
  readonly phoneEnding: string;
  readonly plate: string;
  readonly previousAssociation: string;
  readonly recognitionError: string;
  readonly recognizing: string;
  readonly recognizingTitle: string;
  readonly recoverableSessions: string;
  readonly recoverableContinuation: string;
  readonly recoverableDraft: string;
  readonly retryDiscovery: string;
  readonly retrySame: string;
  readonly savedBody: string;
  readonly skipVehicleDetails: string;
  readonly smsNotice: string;
  readonly scanPlate: string;
  readonly submitting: string;
  readonly submittingTitle: string;
  readonly title: string;
  readonly temporaryDescriptor: string;
  readonly unreadable: string;
  readonly useSavedCustomer: string;
  readonly unknown: string;
  readonly returningCustomer: string;
  readonly vehicle: string;
  readonly vehicleDescription: string;
  readonly vehicleDetails: string;
  readonly vehicleDescriptionExample: string;
  readonly vehicleFound: string;
  readonly awaitingParkingBody: string;
  readonly awaitingParkingTitle: string;
  readonly countryNames: Readonly<
    Record<"JO" | "AE" | "SA" | "KW" | "BH" | "OTHER", string>
  >;
}

export function getNativeCheckInCopy(
  locale: EmployeeLocale,
): NativeCheckInCopy {
  const d = getNativeEmployeeDictionary(locale);
  return {
    back: d.back,
    cancel: d.cancelAction,
    checkServer: d.retry,
    close: d.backToQueue,
    confirmDescription: d.confirm,
    confirmPlate: d.confirmPlate,
    continueLabel: d.continueLabel,
    continueToCustomer: d.continueToCustomer,
    continueWithoutRecognition: d.continueWithoutRecognition,
    country: d.countryRegion,
    locationTrackingParking: d.locationTrackingParking,
    parkingState: d.parkingState,
    parkingStartFailed: d.operationFailed,
    parkingTask: d.parkingTask,
    startParking: d.startParkingAction,
    startingParking: d.startingParking,
    customerContact: d.customerContact,
    color: d.color,
    correctVehicleDetails: d.correctVehicleDetails,
    done: d.done,
    differentCustomer: d.differentCustomer,
    detected: d.detected,
    discoveryError: d.operationFailed,
    discoveryErrorTitle: d.failedCheckIn,
    discoveryTitle: d.checkInDiscovery,
    edit: d.edit,
    enterManually: d.enterManually,
    enterPlate: d.enterPlate,
    intakeUnknown: d.operationFailed,
    intakeUnknownTitle: d.connectionIssue,
    loading: d.checkingDrafts,
    manualEntry: d.manualEntry,
    enteredPlate: d.enteredPlate,
    highConfidence: d.highConfidence,
    multiple: d.multipleCheckIns,
    newVehicle: d.newVehicle,
    noPhone: d.noPhone,
    noPlate: d.noPlateUnreadable,
    noPlateExample: d.vehicleDescriptionExample,
    phone: d.mobileNumber,
    make: d.make,
    model: d.model,
    notSpecified: d.notSpecified,
    phoneAmbiguous: d.operationFailed,
    savedCustomerStale: d.operationFailed,
    phoneEnding: d.phoneEnding,
    plate: d.licensePlate,
    previousAssociation: d.returningCustomer,
    recognitionError: d.operationFailed,
    recognizing: d.checkingDrafts,
    recognizingTitle: d.vehicleFound,
    recoverableSessions: d.recoverableSessions,
    recoverableContinuation: d.awaitingParking,
    recoverableDraft: d.draft,
    retryDiscovery: d.retryDiscovery,
    retrySame: d.retryDiscovery,
    savedBody: d.useSavedCustomer,
    skipVehicleDetails: d.skipVehicleDetails,
    smsNotice: d.smsNotice,
    scanPlate: d.scanPlate,
    submitting: d.creatingIntake,
    submittingTitle: d.creatingIntake,
    title: d.newVehicle,
    temporaryDescriptor: d.temporaryDescriptor,
    unreadable: d.vehicleDescription,
    useSavedCustomer: d.useSavedCustomer,
    unknown: d.unknown,
    returningCustomer: d.returningCustomer,
    vehicle: d.vehicle,
    vehicleDescription: d.vehicleDescription,
    vehicleDetails: d.vehicleDetails,
    vehicleDescriptionExample: d.vehicleDescriptionExample,
    vehicleFound: d.vehicleFound,
    awaitingParkingBody: d.awaitingParking,
    awaitingParkingTitle: d.awaitingParking,
    countryNames: {
      JO: d.jordan,
      AE: d.uae,
      SA: d.saudiArabia,
      KW: d.kuwait,
      BH: d.bahrain,
      OTHER: d.other,
    },
  };
}
