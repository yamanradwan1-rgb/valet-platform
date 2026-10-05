import { styles } from "../administration-ui";
import type { DashboardLocale } from "../../../lib/i18n/locale";
import { presenceCopy } from "./shift-presence-copy";

export function PresencePagination(props: {
  readonly locale: DashboardLocale;
  readonly previous: boolean;
  readonly next: boolean;
  readonly loading: boolean;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
}) {
  const t = presenceCopy(props.locale);
  return (
    <div className={styles.actions}>
      <button
        className={styles.secondary}
        disabled={!props.previous || props.loading}
        onClick={props.onPrevious}
      >
        {t("previous")}
      </button>
      <button
        className={styles.secondary}
        disabled={!props.next || props.loading}
        onClick={props.onNext}
      >
        {t("next")}
      </button>
    </div>
  );
}

export function PresenceReadFeedback(props: {
  readonly locale: DashboardLocale;
  readonly error: Error | null;
  readonly loading: boolean;
  readonly onRefresh: () => void;
}) {
  const t = presenceCopy(props.locale);
  return (
    <>
      {props.loading ? <p role="status">{t("loading")}</p> : null}
      {props.error ? (
        <div className={styles.error} role="alert">
          {t("failed")}
        </div>
      ) : null}
      <button
        className={styles.secondary}
        disabled={props.loading}
        onClick={props.onRefresh}
      >
        {t(props.error ? "retry" : "refresh")}
      </button>
    </>
  );
}

export function presenceTime(
  value: string,
  timezone: string,
  locale: DashboardLocale,
) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}
