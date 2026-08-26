import type { JSX } from "react";

import {
  BackHeader,
  Badge,
  Btn,
  ScannerFrame,
} from "../ui/employee-primitives";
import { useEmployeeI18n } from "../shell/employee-i18n";
import {
  resourceQrScanLabels,
  ResourceQrScanSection,
} from "../scanner/resource-qr-scan-section";

export interface ParkingKeyReturnStepProps {
  readonly error?: string | null | undefined;
  readonly isOnline: boolean;
  readonly isSubmitting: boolean;
  readonly keySlotCodeInput: string;
  readonly mode?: "live" | "prototype" | undefined;
  readonly onChangeKeySlotCode: (code: string) => void;
  readonly onConfirm: () => void;
  readonly onBack: () => void;
}

/**
 * DEC-068 §23 post-parking key binding: no slot is pre-assigned and there is
 * no availability picker. The employee places the key into any visibly free
 * physical slot, then scans QR or enters THAT slot's code. Manual entry stays
 * visible and operable in every camera state (DEC-067 §7); a decode only
 * fills the existing input; the server stays final authority at Confirm
 * Parked time.
 */
export function ParkingKeyReturnStep({
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
        <div className="bg-ice rounded-xl px-4 py-4 flex items-start gap-2.5">
          <span className="w-1.5 h-1.5 rounded-full bg-vblue flex-shrink-0 mt-1.5" />
          <p className="text-vblue text-sm font-semibold leading-relaxed">
            {t.returnKeyAvailable}
          </p>
        </div>
        {mode === "live" ? (
          // DEC-067: real camera capture fills the existing key-slot input;
          // the confirmed key deposit below is submitted via Confirm Parked
          // (DEC-065/DEC-068).
          <ResourceQrScanSection
            expectedKind="key-slot"
            labels={resourceQrScanLabels(t, "key-slot")}
            onDecoded={onChangeKeySlotCode}
          />
        ) : (
          <ScannerFrame label={t.scanKeySlot} sublabel={t.chooseManually} />
        )}
        {mode === "prototype" && (
          <Btn
            label={t.simulateKeyQr}
            onClick={() =>
              onChangeKeySlotCode("K-03")
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
