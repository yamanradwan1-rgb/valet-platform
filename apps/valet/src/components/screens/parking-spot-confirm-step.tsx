import type { JSX } from "react";

import {
  BackHeader,
  Btn,
  ScannerFrame,
} from "../ui/employee-primitives";
import { useEmployeeI18n } from "../shell/employee-i18n";

export interface ParkingSpotConfirmStepProps {
  readonly destination: string;
  readonly error?: string | null | undefined;
  readonly isSubmitting?: boolean | undefined;
  readonly mode?: "live" | "prototype" | undefined;
  readonly onChangeSpot: (code: string) => void;
  readonly onContinue: () => void;
  readonly onBack: () => void;
  readonly onEnterManually: () => void;
  readonly onRescan: () => void;
  readonly onSimulateScan?: (() => void) | undefined;
  readonly spotScanned: boolean;
  readonly value: string;
}

/**
 * Spot capture step for the verified key return parking flow. Continuing to
 * the Key Return step only preserves the entered code as transient in-memory
 * draft state (DEC-063); it never performs a protected mutation and stays
 * available while the browser reports offline.
 */
export function ParkingSpotConfirmStep({
  destination,
  error,
  isSubmitting = false,
  mode = "live",
  onChangeSpot,
  onContinue,
  onBack,
  onEnterManually,
  onRescan,
  onSimulateScan,
  spotScanned,
  value,
}: ParkingSpotConfirmStepProps): JSX.Element {
  const { t } = useEmployeeI18n();

  return (
    <div>
      <BackHeader title={t.parkingSpot} onBack={onBack} />
      {error && (
        <div className="mx-5 mt-3 p-3 bg-red-50 border border-vdanger/20 rounded-xl text-vdanger text-xs">
          {error}
        </div>
      )}
      {!spotScanned ? (
        <>
          <ScannerFrame
            label={t.scanParkingQr}
            sublabel={t.chooseManually}
          />
          <div className="p-5 space-y-3">
            {mode === "prototype" && onSimulateScan && (
              <Btn label={t.simulateSpotScan} onClick={onSimulateScan} />
            )}
            <Btn
              label={t.enterSpotManually}
              variant={mode === "prototype" ? "secondary" : "primary"}
              onClick={onEnterManually}
            />
          </div>
        </>
      ) : (
        <div className="p-5 space-y-5">
          <div className="bg-[#EEFBF5] border border-vsuccess/20 rounded-2xl p-5 text-center">
            <p className="text-muted text-xs font-semibold uppercase tracking-wider mb-2">
              {t.location}
            </p>
            <p className="font-heading font-bold text-3xl text-navy">
              <bdi dir="ltr">{destination}</bdi>
            </p>
            <div className="mt-2">
              <label className="text-neutral text-xs font-semibold uppercase tracking-wider block mb-1">
                {t.spotCode}
              </label>
              <input
                value={value}
                dir="ltr"
                onChange={(e) => onChangeSpot(e.target.value)}
                placeholder={t.enterSpotCode}
                className="w-full text-center font-heading font-semibold text-xl text-navy bg-white border border-vborder rounded-xl h-12 focus:outline-none focus:border-vblue"
              />
            </div>
          </div>
          <Btn
            label={t.continueLabel}
            onClick={onContinue}
            variant="success"
            disabled={value.trim() === ""}
          />
          <Btn
            label={t.scanAgain}
            variant="secondary"
            size="md"
            onClick={onRescan}
            disabled={isSubmitting}
          />
        </div>
      )}
    </div>
  );
}
