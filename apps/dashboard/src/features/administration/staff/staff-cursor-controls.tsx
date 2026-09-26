"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import type { DashboardLocale } from "../../../lib/i18n/locale";
import { administrationCopy } from "../administration-copy";
import referenceStyles from "./staff-reference.module.css";

export function StaffCursorControls(props: {
  readonly canNext: boolean;
  readonly canPrevious: boolean;
  readonly label: string;
  readonly loading: boolean;
  readonly locale: DashboardLocale;
  readonly onNext: () => void;
  readonly onPrevious: () => void;
}) {
  if (!props.canNext && !props.canPrevious) return null;
  const t = administrationCopy(props.locale);
  const Previous = props.locale === "ar" ? ChevronRight : ChevronLeft;
  const Next = props.locale === "ar" ? ChevronLeft : ChevronRight;
  return (
    <div className={referenceStyles.pagination}>
      <span>{props.label}</span>
      <div className={referenceStyles.cursorButtons}>
        <button
          aria-label={t.previous}
          className={referenceStyles.cursorButton}
          disabled={!props.canPrevious || props.loading}
          onClick={props.onPrevious}
          type="button"
        >
          <Previous aria-hidden="true" size={16} />
        </button>
        <button
          aria-label={t.next}
          className={referenceStyles.cursorButton}
          disabled={!props.canNext || props.loading}
          onClick={props.onNext}
          type="button"
        >
          <Next aria-hidden="true" size={16} />
        </button>
      </div>
    </div>
  );
}
