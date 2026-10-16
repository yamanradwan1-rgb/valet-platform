"use client";

import type { ReactNode } from "react";
import type { DashboardLocale } from "../../../lib/i18n/locale";
import styles from "./shift-presence-map-first-layout.module.css";

export type ShiftPresenceView =
  | "overview"
  | "zones"
  | "policy"
  | "exceptions"
  | "setup";

export interface ShiftPresenceMapFirstLayoutProps {
  readonly locale: DashboardLocale;
  readonly heading: ReactNode;
  readonly overview: ReactNode;
  readonly zones: ReactNode;
  readonly policy: ReactNode;
  readonly exceptions: ReactNode;
  readonly setup: ReactNode;
  readonly activeView: ShiftPresenceView;
  readonly onView: (view: ShiftPresenceView) => void;
}

const views: readonly ShiftPresenceView[] = [
  "overview",
  "zones",
  "policy",
  "exceptions",
  "setup",
];

const copy = {
  en: {
    navigation: "Shift presence workspace",
    overview: "Overview & map",
    zones: "Attendance zones",
    policy: "Start / end policy",
    exceptions: "Exceptions",
    setup: "Guided setup",
    map: "Saved attendance zone map",
    summary: "Configuration and readiness",
  },
  ar: {
    navigation: "مساحة إدارة الحضور للورديات",
    overview: "نظرة عامة وخريطة",
    zones: "مناطق الحضور",
    policy: "سياسة بدء وإنهاء الوردية",
    exceptions: "الاستثناءات",
    setup: "الإعداد الموجّه",
    map: "خريطة مناطق الحضور المحفوظة",
    summary: "الإعدادات والجاهزية",
  },
} satisfies Record<DashboardLocale, Record<string, string>>;

/** Presentation only: the parent supplies authorized server-backed content. */
export function ShiftPresenceMapFirstLayout({
  locale,
  heading,
  overview,
  zones,
  policy,
  exceptions,
  setup,
  activeView,
  onView,
}: ShiftPresenceMapFirstLayoutProps) {
  const t = copy[locale];
  const selected = views.includes(activeView) ? activeView : "overview";

  return (
    <div
      className={styles.layout}
      data-testid="shift-presence-map-first-layout"
      data-active-view={selected}
      dir={locale === "ar" ? "rtl" : "ltr"}
    >
      <div className={styles.heading}>{heading}</div>

      <nav aria-label={t.navigation} className={styles.navigation}>
        {views.map((view) => (
          <button
            aria-pressed={view === selected}
            className={`${styles.navButton} ${view === selected ? styles.navActive : ""}`}
            data-testid={`presence-view-${view}`}
            key={view}
            onClick={() => onView(view)}
            type="button"
          >
            {t[view]}
          </button>
        ))}
      </nav>

      <section
        aria-label={t[selected]}
        className={styles.view}
        data-testid="presence-active-view"
      >
        {selected === "overview" ? (
          <div className={styles.overviewGrid}>
            <section aria-label={t.map} className={styles.mapSpotlight}>
              {zones}
            </section>
            <aside aria-label={t.summary} className={styles.summary}>
              {overview}
            </aside>
          </div>
        ) : selected === "zones" ? (
          <div className={styles.fullMap}>{zones}</div>
        ) : selected === "policy" ? (
          policy
        ) : selected === "exceptions" ? (
          exceptions
        ) : (
          setup
        )}
      </section>
    </div>
  );
}
