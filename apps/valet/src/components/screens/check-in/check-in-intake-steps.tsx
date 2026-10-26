import type { JSX } from "react";

import { CheckSmIcon } from "../../icons/employee-icons";
import { BackHeader, Btn, VehicleIdentity } from "../../ui/employee-primitives";
import { useEmployeeI18n } from "../../shell/employee-i18n";

export function CheckInCustomerPhoneStep({
  phone,
  make,
  model,
  color,
  plate,
  isSubmitting,
  error,
  errorCode,
  onChangePhone,
  onContinue,
  onNoPhone,
  onBack,
}: {
  readonly color?: string | null | undefined;
  readonly error?: string | null | undefined;
  readonly errorCode?: string | null | undefined;
  readonly isSubmitting?: boolean | undefined;
  readonly make?: string | null | undefined;
  readonly model?: string | null | undefined;
  readonly onBack: () => void;
  readonly onChangePhone: (val: string) => void;
  readonly onContinue: () => void;
  readonly onNoPhone: () => void;
  readonly phone: string;
  readonly plate?: string | null | undefined;
}): JSX.Element {
  const { t } = useEmployeeI18n();
  const displayModel = make && model ? `${make} ${model}` : (make || model || t.vehicle);
  const intakeStopped = errorCode === "LOCATION_INTAKE_STOPPED";
  const feedback = error && (
    <div
      className="p-3 bg-red-50 border border-vdanger/20 rounded-xl text-vdanger text-xs"
      role={intakeStopped ? "alert" : undefined}
    >
      {error}
    </div>
  );
  return (
    <div>
      <BackHeader
        disabled={isSubmitting}
        title={t.customerContact}
        onBack={onBack}
      />
      <div className="p-5 space-y-5">
        {!intakeStopped && feedback}
        <div className="bg-white rounded-2xl border border-vborder p-4">
          <VehicleIdentity
            color={color ?? t.notSpecified}
            model={displayModel}
            plate={plate ?? t.noPlate}
          />
        </div>
        <div>
          <label className="text-navy font-semibold text-sm block mb-2">
            {t.mobileNumber}
          </label>
          <div className="flex gap-2">
            <div className="flex items-center gap-1.5 h-14 px-3 border border-vborder rounded-xl bg-white min-w-[84px] cursor-pointer">
              <span className="text-base">🇯🇴</span>
              <span className="text-navy font-semibold text-sm">+962</span>
            </div>
            <input
              type="tel"
              placeholder="79 000 0000"
              value={phone}
              dir="ltr"
              onChange={(e) => onChangePhone(e.target.value)}
              className="flex-1 h-14 border border-vborder rounded-xl px-4 text-navy text-base focus:outline-none focus:border-vblue transition-colors bg-white"
            />
          </div>
          <p className="text-muted text-xs mt-2">
            {t.smsNotice}
          </p>
        </div>
        {intakeStopped && feedback}
        <Btn
          label={isSubmitting ? t.creatingIntake : t.continueLabel}
          onClick={onContinue}
          disabled={isSubmitting ?? false}
        />
        <Btn
          label={t.noPhone}
          variant="ghost"
          size="md"
          onClick={onNoPhone}
          disabled={isSubmitting ?? false}
        />
      </div>
    </div>
  );
}

export function CheckInVehicleConditionStep({
  condition,
  make,
  model,
  color,
  plate,
  isSubmitting,
  error,
  onSelectCondition,
  onContinue,
  onBack,
}: {
  readonly color?: string | null | undefined;
  readonly condition: string;
  readonly error?: string | null | undefined;
  readonly isSubmitting?: boolean | undefined;
  readonly make?: string | null | undefined;
  readonly model?: string | null | undefined;
  readonly onBack: () => void;
  readonly onContinue: () => void;
  readonly onSelectCondition: (opt: string) => void;
  readonly plate?: string | null | undefined;
}): JSX.Element {
  const { t } = useEmployeeI18n();
  const options = [
    { label: t.noVisibleIssue, value: "No visible issue" },
    { label: t.existingDamage, value: "Existing damage" },
    { label: t.needsReview, value: "Needs review" },
  ];
  const displayModel = make && model ? `${make} ${model}` : (make || model || t.vehicle);

  return (
    <div>
      <BackHeader title={t.vehicleCondition} onBack={onBack} />
      <div className="p-5 space-y-5">
        {error && (
          <div className="p-3 bg-red-50 border border-vdanger/20 rounded-xl text-vdanger text-xs">
            {error}
          </div>
        )}
        <div className="bg-white rounded-2xl border border-vborder p-4">
          <VehicleIdentity
            color={color ?? t.notSpecified}
            model={displayModel}
            plate={plate ?? t.noPlate}
          />
        </div>
        <div className="space-y-2">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSelectCondition(opt.value)}
              className={`w-full flex items-center gap-3 px-4 py-4 rounded-xl border-2 transition-all cursor-pointer text-left ${
                condition === opt.value
                  ? "border-vblue bg-ice"
                  : "border-vborder bg-white hover:bg-gray-50"
              }`}
            >
              <span
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  condition === opt.value ? "border-vblue bg-vblue" : "border-vborder"
                }`}
              >
                {condition === opt.value && <CheckSmIcon />}
              </span>
              <span
                className={`font-semibold text-sm ${
                  condition === opt.value ? "text-vblue" : "text-navy"
                }`}
              >
                {opt.label}
              </span>
            </button>
          ))}
        </div>
        <div className="p-3 bg-gray-50 border border-vborder rounded-xl text-muted text-xs text-center">
          {t.photosOptional}
        </div>
        <Btn
          label={isSubmitting ? t.completingCondition : t.continueLabel}
          onClick={onContinue}
          disabled={isSubmitting ?? false}
        />
      </div>
    </div>
  );
}
