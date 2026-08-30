import type { JSX } from "react";

import { Btn } from "../ui/employee-primitives";

export interface ShiftEndErrorProps {
  readonly message: string | null;
  readonly onReviewOpenWork?: (() => void) | undefined;
  readonly openWorkBlocked: boolean;
  readonly reviewOpenWorkLabel: string;
}

/** Actionable presentation for a rejected End Shift command. */
export function ShiftEndError({
  message,
  onReviewOpenWork,
  openWorkBlocked,
  reviewOpenWorkLabel,
}: ShiftEndErrorProps): JSX.Element | null {
  if (message === null) return null;
  return (
    <div className="space-y-2">
      <p
        role="alert"
        className={`text-xs font-semibold ${
          openWorkBlocked ? "text-navy" : "text-vdanger"
        }`}
      >
        {message}
      </p>
      {openWorkBlocked && onReviewOpenWork !== undefined && (
        <Btn
          label={reviewOpenWorkLabel}
          onClick={onReviewOpenWork}
          variant="secondary"
          size="md"
        />
      )}
    </div>
  );
}
