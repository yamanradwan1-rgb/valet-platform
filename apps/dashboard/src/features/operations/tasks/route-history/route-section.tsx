"use client";

import { lazy, Suspense, useId, useState } from "react";
import { Route, ArrowUpRight } from "lucide-react";
import type { ManagementLocation, TaskOverviewEntry } from "@valet/contracts";
import type { DashboardApiClient } from "../../../../lib/api/dashboard-api-client";
import { useDashboardLocale } from "../../../../lib/i18n/locale-provider";
import { styles } from "../../operations-ui";
import { routeCopy } from "./route-copy";
import s from "./route-history.module.css";

const RouteViewer = lazy(() => import("./route-viewer"));

export function RouteHistorySection(props: {
  readonly api: DashboardApiClient;
  readonly item: TaskOverviewEntry;
  readonly location: ManagementLocation;
  readonly scopeKey: string;
  readonly role: "COMPANY_ADMIN" | "LOCATION_MANAGER" | "SUPERVISOR";
}) {
  const { locale } = useDashboardLocale();
  const t = routeCopy(locale);
  const heading = useId();
  const [open, setOpen] = useState(false);
  const active = props.item.status !== "COMPLETED";
  const denied = props.role === "COMPANY_ADMIN";
  return (
    <section
      className={s.section}
      aria-labelledby={heading}
      data-testid="task-route-history-section"
    >
      <div className={s.sectionHeading}>
        <Route size={17} aria-hidden="true" />
        <h3 id={heading}>{t.title}</h3>
      </div>
      <p>{active ? t.active : denied ? t.deniedBody : t.description}</p>
      <button
        className={styles.secondary}
        disabled={active || denied}
        onClick={() => setOpen(true)}
        type="button"
      >
        <Route size={15} aria-hidden="true" />
        {t.view}
        <ArrowUpRight size={14} aria-hidden="true" />
      </button>
      {active || denied ? (
        <p role="status">{active ? t.activeBody : t.denied}</p>
      ) : null}
      {open && !active && !denied ? (
        <Suspense fallback={<p role="status">{t.loading}</p>}>
          <RouteViewer {...props} onClose={() => setOpen(false)} />
        </Suspense>
      ) : null}
    </section>
  );
}
