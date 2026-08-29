import { useState, type JSX } from "react";

import type {
  CheckInVehicleDetailsDraft,
  RecognizedCheckInVehicle,
} from "../../../features/check-in";
import { useEmployeeI18n } from "../../shell/employee-i18n";
import { BackHeader, Btn, VehicleIdentity } from "../../ui/employee-primitives";
import {
  CheckInVehicleDetailFields,
  type VehicleDetailFieldValues,
} from "./check-in-vehicle-detail-fields";

export function CheckInReturningVehicleStep({
  vehicle,
  correctionConflict,
  customerResolved,
  isSubmitting,
  error,
  onBack,
  onContinue,
  onDifferentCustomer,
  onSaveCorrection,
  onUseSavedCustomer,
}: {
  readonly correctionConflict: boolean;
  readonly customerResolved: boolean;
  readonly error: string | null;
  readonly isSubmitting: boolean;
  readonly onBack: () => void;
  readonly onContinue: () => void;
  readonly onDifferentCustomer: () => void;
  readonly onSaveCorrection: (details: CheckInVehicleDetailsDraft) => void;
  readonly onUseSavedCustomer: () => void;
  readonly vehicle: RecognizedCheckInVehicle;
}): JSX.Element {
  const { t } = useEmployeeI18n();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<VehicleDetailFieldValues>({
    color: vehicle.color ?? "",
    make: vehicle.make ?? "",
    model: vehicle.model ?? "",
  });
  const displayModel =
    [vehicle.make, vehicle.model].filter(Boolean).join(" ") || t.vehicle;

  const beginEditing = () => {
    setValues({
      color: vehicle.color ?? "",
      make: vehicle.make ?? "",
      model: vehicle.model ?? "",
    });
    setEditing(true);
  };

  const save = () => {
    onSaveCorrection({
      color: values.color.trim() || null,
      make: values.make.trim() || null,
      model: values.model.trim() || null,
    });
    setEditing(false);
  };

  return (
    <div>
      <BackHeader
        disabled={isSubmitting}
        title={t.vehicleFound}
        onBack={onBack}
      />
      <div className="p-5 space-y-5">
        {(error || correctionConflict) && (
          <div
            className={`p-3 border rounded-xl text-xs ${correctionConflict ? "bg-ice border-vborder text-navy" : "bg-red-50 border-vdanger/20 text-vdanger"}`}
          >
            {correctionConflict ? t.vehicleDetailsUpdated : error}
          </div>
        )}
        <div className="bg-white rounded-2xl border border-vborder p-4">
          {editing ? (
            <CheckInVehicleDetailFields values={values} onChange={setValues} />
          ) : (
            <VehicleIdentity
              color={vehicle.color ?? t.notSpecified}
              model={displayModel}
              plate={vehicle.plateNumberRaw}
            />
          )}
        </div>
        {editing ? (
          <div className="space-y-3">
            <Btn label={t.done} onClick={save} size="md" />
            <Btn
              label={t.cancelLabel}
              onClick={() => setEditing(false)}
              variant="secondary"
              size="md"
            />
          </div>
        ) : (
          <>
            {!customerResolved && vehicle.returningCustomer && (
              <div className="bg-white rounded-xl border border-vborder p-4">
                <p className="text-muted text-xs mb-2">{t.returningCustomer}</p>
                {vehicle.returningCustomer.displayName && (
                  <p className="font-semibold text-navy">
                    {vehicle.returningCustomer.displayName}
                  </p>
                )}
                <p className="text-neutral text-sm">
                  {t.phoneEnding}{" "}
                  <bdi dir="ltr">{vehicle.returningCustomer.phoneSuffix}</bdi>
                </p>
              </div>
            )}
            {customerResolved ? (
              <Btn
                label={t.continueLabel}
                onClick={onContinue}
                disabled={isSubmitting}
              />
            ) : vehicle.returningCustomer ? (
              <>
                <Btn
                  label={t.useSavedCustomer}
                  onClick={onUseSavedCustomer}
                  disabled={isSubmitting}
                />
                <Btn
                  label={t.differentCustomer}
                  variant="secondary"
                  onClick={onDifferentCustomer}
                  disabled={isSubmitting}
                />
              </>
            ) : (
              <Btn
                label={t.continueToCustomer}
                onClick={onDifferentCustomer}
                disabled={isSubmitting}
              />
            )}
            <Btn
              label={t.correctVehicleDetails}
              variant="ghost"
              size="md"
              onClick={beginEditing}
              disabled={isSubmitting}
            />
          </>
        )}
      </div>
    </div>
  );
}
