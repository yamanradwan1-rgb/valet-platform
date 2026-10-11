"use client";

import { useState, type FormEvent } from "react";
import { RefreshCw, X } from "lucide-react";

import { FocusDialog } from "../../components/presentation/focus-dialog";
import { BidiText } from "../../components/presentation/panel";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { ScopedContextHelp } from "../help/scoped-context-help";
import { dashboardPeriodPresets } from "./dashboard-period-calendar";
import {
  validateAnalyticsPeriod,
  type AnalyticsPeriodValidation,
} from "./intelligence-period-validation";
import type { useDashboardPeriod } from "./use-dashboard-period";
import styles from "./dashboard-period-control.module.css";
import dialogStyles from "./intelligence-period.module.css";

type PeriodState = ReturnType<typeof useDashboardPeriod>;

const labels = {
  en: {
    short: ["Today", "2D", "3D", "7D", "14D", "30D"],
    long: [
      "Today",
      "Last 2 days",
      "Last 3 days",
      "Last 7 days",
      "Last 14 days",
      "Last 30 days",
    ],
    custom: "Custom",
    dialog: "Select analytics period",
    from: "From",
    to: "To",
    cancel: "Cancel",
    apply: "Apply",
    invalid:
      "Use real canonical dates, From on or before To, with at most 31 inclusive calendar days.",
    refresh: "Refresh period",
    refreshing: "Refreshing period…",
    companyNote: "Based on company calendar timezone",
    locationNote: "Based on Location calendar timezone",
  },
  ar: {
    short: ["اليوم", "٢ي", "٣ي", "٧ي", "١٤ي", "٣٠ي"],
    long: [
      "اليوم",
      "آخر يومين",
      "آخر ٣ أيام",
      "آخر ٧ أيام",
      "آخر ١٤ يومًا",
      "آخر ٣٠ يومًا",
    ],
    custom: "مخصص",
    dialog: "اختيار فترة التحليلات",
    from: "من",
    to: "إلى",
    cancel: "إلغاء",
    apply: "تطبيق",
    invalid:
      "استخدم تواريخ صحيحة، من قبل إلى أو يساويه، وبحد أقصى ٣١ يومًا تقويميًا.",
    refresh: "تحديث الفترة",
    refreshing: "جارٍ تحديث الفترة…",
    companyNote: "حسب المنطقة الزمنية لتقويم الشركة",
    locationNote: "حسب المنطقة الزمنية لتقويم الموقع",
  },
} as const;

export function DashboardPeriodControl(props: {
  readonly state: PeriodState;
  readonly scopeKind: "COMPANY" | "LOCATION";
  readonly onRefresh: () => void;
  readonly refreshing: boolean;
  readonly helpKey?: "overview.period" | "payments.period" | "analytics.period";
}) {
  const { locale } = useDashboardLocale();
  const copy = labels[locale];
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [error, setError] = useState<AnalyticsPeriodValidation["kind"] | null>(
    null,
  );
  const active = props.state.selection;

  function openCustom() {
    setDraftFrom(props.state.period?.from ?? "");
    setDraftTo(props.state.period?.to ?? "");
    setError(null);
    setOpen(true);
  }

  function apply(event: FormEvent) {
    event.preventDefault();
    const result = validateAnalyticsPeriod(draftFrom, draftTo);
    if (result.kind !== "valid") {
      setError(result.kind);
      return;
    }
    props.state.applyCustom(result.period);
    setOpen(false);
  }

  return (
    <div className={styles.host} data-testid="dashboard-period-control">
      <div aria-label={copy.dialog} className={styles.scroll} role="group">
        {dashboardPeriodPresets.map((preset, index) => (
          <button
            aria-label={copy.long[index]}
            aria-pressed={active?.kind === "PRESET" && active.preset === preset}
            className={styles.choice}
            key={preset}
            onClick={() => props.state.selectPreset(preset)}
            type="button"
          >
            {copy.short[index]}
          </button>
        ))}
        <button
          aria-haspopup="dialog"
          aria-pressed={active?.kind === "CUSTOM"}
          className={styles.choice}
          onClick={openCustom}
          type="button"
        >
          {copy.custom}
        </button>
        <button
          aria-label={copy.refresh}
          className={styles.choice}
          disabled={!props.state.period}
          onClick={props.onRefresh}
          title={copy.refresh}
          type="button"
        >
          <RefreshCw aria-hidden="true" size={14} />
        </button>
      </div>
      {props.helpKey ? (
        <span className={styles.helpSlot}>
          <ScopedContextHelp helpKey={props.helpKey} />
        </span>
      ) : null}
      <div className={styles.detail}>
        {props.state.period ? (
          <BidiText kind="number">
            {props.state.period.from} – {props.state.period.to}
          </BidiText>
        ) : null}
        <span>
          {props.scopeKind === "COMPANY" ? copy.companyNote : copy.locationNote}
        </span>
        {props.refreshing ? (
          <span className={styles.refreshing} role="status">
            {copy.refreshing}
          </span>
        ) : null}
      </div>
      {open ? (
        <div className={dialogStyles.periodHost}>
          <FocusDialog label={copy.dialog} onClose={() => setOpen(false)}>
            <header className={dialogStyles.periodDialogHeader}>
              <h2>{copy.dialog}</h2>
            </header>
            <form className={dialogStyles.periodForm} onSubmit={apply}>
              <div className={dialogStyles.periodFields}>
                <label className={dialogStyles.periodField}>
                  {copy.from}
                  <input
                    aria-label={copy.from}
                    onChange={(event) => setDraftFrom(event.target.value)}
                    type="date"
                    value={draftFrom}
                  />
                </label>
                <label className={dialogStyles.periodField}>
                  {copy.to}
                  <input
                    aria-label={copy.to}
                    onChange={(event) => setDraftTo(event.target.value)}
                    type="date"
                    value={draftTo}
                  />
                </label>
              </div>
              {error ? (
                <p className={dialogStyles.periodError} role="alert">
                  {copy.invalid}
                </p>
              ) : null}
              <div className={dialogStyles.periodActions}>
                <button
                  className={dialogStyles.periodCancel}
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  {copy.cancel}
                </button>
                <button className={dialogStyles.periodApply} type="submit">
                  {copy.apply}
                </button>
              </div>
            </form>
            <button
              aria-label={copy.cancel}
              className={dialogStyles.periodDialogClose}
              onClick={() => setOpen(false)}
              type="button"
            >
              <X aria-hidden="true" size={20} />
            </button>
          </FocusDialog>
        </div>
      ) : null}
    </div>
  );
}
