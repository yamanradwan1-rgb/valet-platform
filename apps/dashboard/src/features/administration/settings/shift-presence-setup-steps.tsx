"use client";

import type { ReactNode } from "react";
import type { DashboardLocale } from "../../../lib/i18n/locale";
import styles from "./shift-presence-map-first-layout.module.css";

interface ShiftPresenceSetupStepsProps {
  readonly step: number;
  readonly onStep: (step: number) => void;
  readonly locale: DashboardLocale;
  readonly children: ReactNode;
}

const labels = {
  en: {
    name: "Shift presence setup",
    scope: "Scope",
    zones: "Zones",
    policy: "Policy",
    review: "Review",
    previous: "Previous",
    next: "Next",
    note: "Changing steps does not save zones or policy. Use each section's own Save action.",
    step: "Step",
  },
  ar: {
    name: "خطوات إعداد الحضور للورديات",
    scope: "النطاق",
    zones: "المناطق",
    policy: "السياسة",
    review: "المراجعة",
    previous: "السابق",
    next: "التالي",
    note: "التنقل بين الخطوات لا يحفظ المناطق أو السياسة. استخدم زر الحفظ في كل قسم.",
    step: "الخطوة",
  },
} satisfies Record<DashboardLocale, Record<string, string>>;

const steps = ["scope", "zones", "policy", "review"] as const;

/** Navigation never writes policy, zones, or completion state. */
export function ShiftPresenceSetupSteps({
  step,
  onStep,
  locale,
  children,
}: ShiftPresenceSetupStepsProps) {
  const t = labels[locale];
  const active = Number.isInteger(step) && step >= 0 && step <= 3 ? step : 0;

  return (
    <section
      aria-label={t.name}
      className={styles.setup}
      data-testid="presence-setup-steps"
      dir={locale === "ar" ? "rtl" : "ltr"}
    >
      <nav aria-label={t.name} className={styles.steps}>
        {steps.map((key, index) => {
          const number = index + 1;
          return (
            <button
              aria-current={active === index ? "step" : undefined}
              aria-label={`${t.step} ${number}: ${t[key]}`}
              className={`${styles.stepButton} ${active === index ? styles.stepCurrent : ""}`}
              key={key}
              onClick={() => onStep(index)}
              type="button"
            >
              <span aria-hidden="true" className={styles.stepIndex}>{number}</span>
              <span className={styles.stepName}>{t[key]}</span>
            </button>
          );
        })}
      </nav>

      <div className={styles.setupBody} data-testid="presence-setup-content">
        {children}
      </div>
      <p className={styles.setupNote}>{t.note}</p>
      <div className={styles.stepActions}>
        <button
          className={styles.stepSecondary}
          disabled={active === 0}
          onClick={() => onStep(active - 1)}
          type="button"
        >
          {t.previous}
        </button>
        <button
          className={styles.stepPrimary}
          disabled={active === 3}
          onClick={() => onStep(active + 1)}
          type="button"
        >
          {t.next}
        </button>
      </div>
    </section>
  );
}
