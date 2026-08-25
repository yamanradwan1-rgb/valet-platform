import type { JSX } from "react";

import {
  BackHeader,
  Badge,
  Btn,
  ScannerFrame,
} from "../ui/employee-primitives";
import { useEmployeeI18n } from "../shell/employee-i18n";

export interface ParkingKeyReturnStepProps {
  readonly assignedKeySlotCode: string | null;
  readonly error?: string | null | undefined;
  readonly isOnline: boolean;
  readonly isSubmitting: boolean;
  readonly keySlotCodeInput: string;
  readonly mode?: "live" | "prototype" | undefined;
  readonly onChangeKeySlotCode: (code: string) => void;
  readonly onConfirm: () => void;
  readonly onBack: () => void;
}

export function ParkingKeyReturnStep({
  assignedKeySlotCode,
  error,
  isOnline,
  isSubmitting,
  keySlotCodeInput,
  mode = "live",
  onChangeKeySlotCode,
  onConfirm,
  onBack,
}: ParkingKeyReturnStepProps): JSX.Element {
  const { t } = useEmployeeI18n();
  const canSubmit =
    isOnline &&
    !isSubmitting &&
    assignedKeySlotCode !== null &&
    keySlotCodeInput.trim() !== "";

  return (
    <div>
      <BackHeader title={t.keySlot} onBack={onBack} />
      {error && (
        <div className="mx-5 mt-3 p-3 bg-red-50 border border-vdanger/20 rounded-xl text-vdanger text-xs">
          {error}
        </div>
      )}
      <div className="p-5 space-y-5">
        <Badge variant="parking" />
        <div className="bg-[#EEFBF5] border border-vsuccess/20 rounded-2xl p-5 text-center">
          <p className="text-muted text-xs font-semibold uppercase tracking-wider mb-2">
            {t.assignedKeySlotLabel}
          </p>
          <p className="font-heading font-bold text-3xl text-navy">
            {assignedKeySlotCode ? (
              <bdi dir="ltr">{assignedKeySlotCode}</bdi>
            ) : (
              t.notAssigned
            )}
          </p>
          <p className="text-vblue text-sm font-semibold mt-3">
            {assignedKeySlotCode ? (
              <>
                {t.returnKeyTo}{" "}
                <bdi dir="ltr">{assignedKeySlotCode}</bdi>
              </>
            ) : (
              t.notAssigned
            )}
          </p>
        </div>
        <ScannerFrame label={t.scanKeySlot} sublabel={t.chooseManually} />
        {mode === "prototype" && (
          <Btn
            label={t.simulateKeyQr}
            onClick={() =>
              onChangeKeySlotCode(assignedKeySlotCode ?? "K-03")
            }
          />
        )}
        <input
          value={keySlotCodeInput}
          dir="ltr"
          onChange={(e) => onChangeKeySlotCode(e.target.value)}
          placeholder={t.enterKeySlotCode}
          className="w-full text-center font-heading font-semibold text-xl text-navy bg-white border border-vborder rounded-xl h-12 focus:outline-none focus:border-vblue"
        />
        {!isOnline && (
          <div className="bg-ice rounded-xl px-4 py-3 flex items-center gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-vdanger flex-shrink-0 mt-px" />
            <p className="text-vdanger text-xs font-semibold">
              {t.noNetworkMessage}
            </p>
          </div>
        )}
        <Btn
          label={isSubmitting ? t.confirming : t.confirmParked}
          onClick={onConfirm}
          variant="success"
          disabled={!canSubmit}
        />
      </div>
    </div>
  );
}
