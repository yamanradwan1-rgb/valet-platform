"use client";

import type { LiveOperationsMapResponse } from "@valet/contracts";
import type { ReactNode } from "react";

import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { operationsCopy } from "../operations-copy";
import { StatusBadge, styles } from "../operations-ui";
import { liveMapItemPresentation } from "./map-presentation";
import reference from "./maps-reference.module.css";

type LiveMapItem = LiveOperationsMapResponse["items"][number];

export function LiveMapPanel(props: {
  readonly help?: ReactNode;
  readonly canNext: boolean;
  readonly canPrevious: boolean;
  readonly hidden: boolean;
  readonly items: readonly LiveMapItem[];
  readonly onNext: () => void;
  readonly onPrevious: () => void;
  readonly timezone: string | undefined;
}) {
  const { locale } = useDashboardLocale();
  const t = operationsCopy(locale);
  return (
    <aside className={reference.panel} aria-label={t.liveMode} hidden={props.hidden}>
      <div className={reference.panelHeader}>
        <h2>{t.liveMode}</h2>
        {props.help}
        <span className={reference.panelCount}>{props.items.length} · {t.currentPageOnly}</span>
      </div>
      <div className={reference.panelBody}>
        {props.items.length === 0
          ? <div className={styles.muted}>{t.noTrackedTasks}</div>
          : props.items.map((item) => {
            const itemView = liveMapItemPresentation(item, locale, props.timezone);
            return (
              <div className={styles.listItem} key={item.taskId}>
                <div className={styles.toolbar}>
                  <strong><bdi dir={itemView.vehicleDirection}>{itemView.vehicle}</bdi></strong>
                  <StatusBadge tone={item.position?.freshness === "LIVE" ? "good" : item.position ? "warn" : "neutral"}>
                    {itemView.freshness}
                  </StatusBadge>
                </div>
                <div className={styles.muted}>{itemView.taskType} · {itemView.sessionState}</div>
                {itemView.captured ? <div className={styles.muted}>{itemView.captured}</div> : null}
                {itemView.areas.map((area) => (
                  <div className={styles.muted} key={area}><bdi dir="auto">{area}</bdi></div>
                ))}
              </div>
            );
          })}
        <div className={reference.panelActions}>
          <button className={styles.secondary} disabled={!props.canPrevious} onClick={props.onPrevious} type="button">{t.previous}</button>
          <button className={styles.secondary} disabled={!props.canNext} onClick={props.onNext} type="button">{t.next}</button>
        </div>
      </div>
    </aside>
  );
}
