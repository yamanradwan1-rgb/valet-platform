"use client";

import { useEffect, useRef } from "react";
import type { InvestigationDemoLocale } from "../investigation-demo-types";
import searchStyles from "../investigation-search.module.css";
import styles from "./investigation-continuation.module.css";

interface Props {
  readonly locale: InvestigationDemoLocale;
  readonly kind: "sessions" | "events";
  readonly hasMore: boolean;
  readonly pending?: boolean;
  readonly error?: string | null;
  readonly added?: number;
  readonly controls: string;
  readonly onExhausted?: () => void;
  readonly onMore: () => void;
}

export function InvestigationContinuationControls(props: Props) {
  const button = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const { hasMore, onExhausted } = props;
  useEffect(() => {
    if (!hasMore && returnFocus.current) {
      returnFocus.current = false;
      onExhausted?.();
    }
  }, [hasMore, onExhausted]);
  if (!props.hasMore && !props.pending) {
    return props.error ? <div className={styles.continuation} role="alert">
      {props.error}
    </div> : null;
  }
  const ar = props.locale === "ar";
  const title = props.error ? ar ? "إعادة المحاولة" : "Retry" :
    props.kind === "sessions"
      ? ar ? "تحميل المزيد من الجلسات" : "Load more Sessions"
      : ar ? "تحميل المزيد من الأحداث" : "Load more events";
  return (
    <div className={styles.continuation}>
      <button ref={button} className={searchStyles.secondaryButton}
        type="button" aria-controls={props.controls}
        onClick={() => {
          returnFocus.current = document.activeElement === button.current;
          props.onMore();
        }} disabled={props.pending}>
        {props.pending ? ar ? "جارٍ التحميل…" : "Loading…" : title}
      </button>
      <span role={props.error ? "alert" : "status"} aria-live={props.error ? "off" : "polite"}>
        {props.error ?? (props.added === undefined ? "" :
          `${ar ? "تم تحميل" : "Loaded"} ${props.added}`)}
      </span>
    </div>
  );
}
