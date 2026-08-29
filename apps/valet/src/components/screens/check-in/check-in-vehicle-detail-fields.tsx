import type { JSX } from "react";

import {
  VEHICLE_COLORS,
  VEHICLE_MAKES,
  vehicleModelsForMake,
} from "../../../features/check-in/vehicle-reference-data";
import { useEmployeeI18n } from "../../shell/employee-i18n";

export interface VehicleDetailFieldValues {
  readonly color: string;
  readonly make: string;
  readonly model: string;
}

export function CheckInVehicleDetailFields({
  values,
  onChange,
}: {
  readonly onChange: (values: VehicleDetailFieldValues) => void;
  readonly values: VehicleDetailFieldValues;
}): JSX.Element {
  const { t } = useEmployeeI18n();
  const fieldClass =
    "w-full h-12 border border-vborder rounded-xl px-4 text-navy text-sm focus:outline-none focus:border-vblue bg-white";
  const models = vehicleModelsForMake(values.make);
  const update = (key: keyof VehicleDetailFieldValues, value: string) =>
    onChange({ ...values, [key]: value });

  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor="check-in-make"
          className="text-navy font-semibold text-sm block mb-2"
        >
          {t.make}
        </label>
        <input
          id="check-in-make"
          list="check-in-makes"
          value={values.make}
          onChange={(event) => update("make", event.target.value)}
          className={fieldClass}
        />
        <datalist id="check-in-makes">
          {VEHICLE_MAKES.map((make) => (
            <option key={make} value={make} />
          ))}
          <option value={t.other} />
          <option value={t.unknown} />
        </datalist>
      </div>
      <div>
        <label
          htmlFor="check-in-model"
          className="text-navy font-semibold text-sm block mb-2"
        >
          {t.model}
        </label>
        <input
          id="check-in-model"
          list="check-in-models"
          value={values.model}
          onChange={(event) => update("model", event.target.value)}
          className={fieldClass}
        />
        <datalist id="check-in-models">
          {models.map((model) => (
            <option key={model} value={model} />
          ))}
          <option value={t.other} />
          <option value={t.unknown} />
        </datalist>
      </div>
      <div>
        <label
          htmlFor="check-in-color"
          className="text-navy font-semibold text-sm block mb-2"
        >
          {t.color}
        </label>
        <input
          id="check-in-color"
          list="check-in-colors"
          value={values.color}
          onChange={(event) => update("color", event.target.value)}
          className={fieldClass}
        />
        <datalist id="check-in-colors">
          {VEHICLE_COLORS.map((color) => (
            <option key={color} value={color} />
          ))}
          <option value={t.other} />
          <option value={t.unknown} />
        </datalist>
      </div>
    </div>
  );
}
