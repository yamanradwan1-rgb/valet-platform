import { useState, type JSX } from "react";

import type { CheckInVehicleDetailsDraft } from "../../../features/check-in";
import { useEmployeeI18n } from "../../shell/employee-i18n";
import { BackHeader, Btn, VehicleIdentity } from "../../ui/employee-primitives";
import {
  CheckInVehicleDetailFields,
  optionalVehicleDetail,
  type VehicleDetailFieldValues,
} from "./check-in-vehicle-detail-fields";

export function CheckInVehicleDetailsStep({
  isNoPlate,
  plate,
  initialDetails,
  initialTemporaryDescriptor,
  onBack,
  onContinue,
}: {
  readonly initialDetails: CheckInVehicleDetailsDraft;
  readonly initialTemporaryDescriptor: string;
  readonly isNoPlate: boolean;
  readonly onBack: () => void;
  readonly onContinue: (
    details: CheckInVehicleDetailsDraft,
    temporaryDescriptor?: string,
  ) => void;
  readonly plate: string;
}): JSX.Element {
  const { t } = useEmployeeI18n();
  const [description, setDescription] = useState(initialTemporaryDescriptor);
  const [values, setValues] = useState<VehicleDetailFieldValues>({
    color: initialDetails.color ?? "",
    make: initialDetails.make ?? "",
    model: initialDetails.model ?? "",
  });
  const descriptionValid = !isNoPlate || description.trim().length > 0;
  const submit = () => {
    if (!descriptionValid) return;
    onContinue(
      {
        color: optionalVehicleDetail(values.color, t.unknown),
        make: optionalVehicleDetail(values.make, t.unknown),
        model: optionalVehicleDetail(values.model, t.unknown),
      },
      isNoPlate ? description.trim() : undefined,
    );
  };

  return (
    <div>
      <BackHeader title={t.vehicleDetails} onBack={onBack} />
      <div className="p-5 space-y-5">
        <div className="bg-white rounded-2xl border border-vborder p-4">
          <VehicleIdentity model={t.vehicle} plate={plate} />
        </div>
        {isNoPlate && (
          <div>
            <label
              htmlFor="vehicle-description"
              className="text-navy font-semibold text-sm block mb-2"
            >
              {t.vehicleDescription}
            </label>
            <input
              id="vehicle-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t.vehicleDescriptionExample}
              className="w-full h-12 border border-vborder rounded-xl px-4 text-navy text-sm focus:outline-none focus:border-vblue bg-white"
              required
            />
          </div>
        )}
        <CheckInVehicleDetailFields values={values} onChange={setValues} />
        <Btn
          label={t.continueLabel}
          onClick={submit}
          disabled={!descriptionValid}
        />
        <Btn
          label={t.skipVehicleDetails}
          variant="ghost"
          size="md"
          onClick={() =>
            onContinue(
              { color: null, make: null, model: null },
              isNoPlate ? description.trim() : undefined,
            )
          }
          disabled={!descriptionValid}
        />
      </div>
    </div>
  );
}
