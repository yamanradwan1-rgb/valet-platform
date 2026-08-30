import type { JSX } from "react";

import { Btn } from "../../ui/employee-primitives";
import { useEmployeeI18n } from "../../shell/employee-i18n";

export interface CheckInManualPlateFieldsProps {
  readonly onChangePlateCountry: (country: string) => void;
  readonly onChangePlateNumber: (plate: string) => void;
  readonly onContinue: () => void;
  readonly onNoPlate: () => void;
  readonly plateCountry: string;
  readonly plateNumber: string;
}

export function CheckInManualPlateFields({
  onChangePlateCountry,
  onChangePlateNumber,
  onContinue,
  onNoPlate,
  plateCountry,
  plateNumber,
}: CheckInManualPlateFieldsProps): JSX.Element {
  const { t } = useEmployeeI18n();
  return (
    <div className="space-y-5">
      <div>
        <label className="text-navy font-semibold text-sm block mb-2">
          {t.licensePlate}
        </label>
        <input
          value={plateNumber}
          dir="ltr"
          onChange={(event) => onChangePlateNumber(event.target.value)}
          placeholder="e.g. 12-34567"
          className="w-full h-14 border border-vborder rounded-2xl px-4 font-heading font-bold text-xl text-center text-navy focus:outline-none focus:border-vblue transition-colors bg-white"
        />
      </div>
      <div>
        <label className="text-navy font-semibold text-sm block mb-2">
          {t.countryRegion}
        </label>
        <select
          value={plateCountry}
          onChange={(event) => onChangePlateCountry(event.target.value)}
          className="w-full h-12 border border-vborder rounded-xl px-4 text-navy text-sm focus:outline-none bg-white cursor-pointer"
        >
          <option value="JO">{t.jordan} (JO)</option>
          <option value="AE">{t.uae} (AE)</option>
          <option value="SA">{t.saudiArabia} (SA)</option>
          <option value="KW">{t.kuwait} (KW)</option>
          <option value="BH">{t.bahrain} (BH)</option>
          <option value="OTHER">{t.other}</option>
        </select>
      </div>
      <Btn label={t.continueLabel} onClick={onContinue} />
      <Btn
        label={t.noPlateUnreadable}
        variant="ghost"
        size="md"
        onClick={onNoPlate}
      />
    </div>
  );
}
