"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import type { DashboardLocale } from "../../lib/i18n/locale";
import { operationsCopy } from "./operations-copy";
import listStyles from "./reference-list.module.css";

export function ReferenceCursorControls(props: {
  readonly canNext: boolean;
  readonly canPrevious: boolean;
  readonly label: string;
  readonly loading: boolean;
  readonly locale: DashboardLocale;
  readonly onNext: () => void;
  readonly onPrevious: () => void;
}) {
  const t = operationsCopy(props.locale);
  const Previous = props.locale === "ar" ? ChevronRight : ChevronLeft;
  const Next = props.locale === "ar" ? ChevronLeft : ChevronRight;
  return (
    <div className={listStyles.pagination}>
      <span>{props.label}</span>
      <div className={listStyles.cursorButtons}>
        <button
          aria-label={t.previous}
          className={listStyles.cursorButton}
          disabled={!props.canPrevious || props.loading}
          onClick={props.onPrevious}
          type="button"
        >
          <Previous aria-hidden="true" size={16} />
        </button>
        <button
          aria-label={t.next}
          className={listStyles.cursorButton}
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
