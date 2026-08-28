"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

import { useTranslation } from "../../i18n/locale-provider";
import type { TranslationKey } from "../../i18n/translations/types";

export type AnalyticsTab = "operations" | "financial" | "incidents";

const TABS: readonly AnalyticsTab[] = ["financial", "incidents", "operations"];

const TAB_LABEL_KEYS: Record<AnalyticsTab, TranslationKey> = {
  financial: "analytics.tab.financial",
  incidents: "analytics.tab.incidents",
  operations: "analytics.tab.operations",
};

function tabId(tab: AnalyticsTab): string {
  return `analytics-${tab}-tab`;
}

function panelId(tab: AnalyticsTab): string {
  return `analytics-${tab}-panel`;
}

/**
 * Automatic-activation tabs. Left/Right follow physical tab order in both
 * LTR and RTL; Home/End remain deterministic and selection follows focus.
 */
export function AnalyticsTabs({
  activeTab,
  onSelect,
  children,
}: {
  activeTab: AnalyticsTab;
  onSelect: (tab: AnalyticsTab) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const refs = useRef<Partial<Record<AnalyticsTab, HTMLButtonElement | null>>>(
    {},
  );

  function moveFocus(
    event: KeyboardEvent<HTMLButtonElement>,
    current: AnalyticsTab,
  ): void {
    const index = TABS.indexOf(current);
    let next: AnalyticsTab | undefined;
    if (event.key === "ArrowRight") next = TABS[(index + 1) % TABS.length];
    if (event.key === "ArrowLeft")
      next = TABS[(index - 1 + TABS.length) % TABS.length];
    if (event.key === "Home") next = TABS[0];
    if (event.key === "End") next = TABS.at(-1);
    if (next === undefined) return;
    event.preventDefault();
    onSelect(next);
    refs.current[next]?.focus();
  }

  return (
    <>
      <div
        className="ana-tabs"
        role="tablist"
        aria-label={t("shell.navAnalytics")}
      >
        {TABS.map((tab) => (
          <button
            id={tabId(tab)}
            ref={(node) => {
              refs.current[tab] = node;
            }}
            aria-controls={panelId(tab)}
            aria-selected={activeTab === tab}
            className={`ana-tab${activeTab === tab ? " is-active" : ""}`}
            key={tab}
            onClick={() => onSelect(tab)}
            onKeyDown={(event) => moveFocus(event, tab)}
            role="tab"
            tabIndex={activeTab === tab ? 0 : -1}
            type="button"
          >
            {t(TAB_LABEL_KEYS[tab])}
          </button>
        ))}
      </div>
      {TABS.map((tab) => {
        const isActive = activeTab === tab;
        return (
          <div
            id={panelId(tab)}
            aria-labelledby={tabId(tab)}
            hidden={!isActive}
            key={tab}
            role="tabpanel"
          >
            {isActive ? children : null}
          </div>
        );
      })}
    </>
  );
}
