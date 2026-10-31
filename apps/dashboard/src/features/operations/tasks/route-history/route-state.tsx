import { MapPinOff, ShieldCheck, Map, Route } from "lucide-react";
import { useDashboardLocale } from "../../../../lib/i18n/locale-provider";
import { styles } from "../../operations-ui";
import { routeCopy } from "./route-copy";
import s from "./route-history.module.css";

export type RouteState =
  "loading" | "empty" | "unavailable" | "provider" | "denied" | "failed";
export function RouteStatePanel({
  state,
  onRetry,
}: {
  state: RouteState;
  onRetry?: () => void;
}) {
  const { locale } = useDashboardLocale();
  const t = routeCopy(locale);
  const Icon =
    state === "denied"
      ? ShieldCheck
      : state === "provider"
        ? Map
        : state === "loading"
          ? Route
          : MapPinOff;
  return (
    <div
      className={s.state}
      role={state === "provider" || state === "failed" ? "alert" : "status"}
      aria-busy={state === "loading"}
    >
      <Icon size={28} strokeWidth={1.5} aria-hidden="true" />
      <h3>{t[state]}</h3>
      {state !== "loading" ? <p>{t[`${state}Body`]}</p> : null}
      {(state === "provider" || state === "failed") && onRetry ? (
        <button className={styles.secondary} type="button" onClick={onRetry}>
          {t.retry}
        </button>
      ) : null}
    </div>
  );
}
