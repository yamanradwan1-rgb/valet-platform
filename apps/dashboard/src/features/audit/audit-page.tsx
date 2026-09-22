"use client";

import { History } from "lucide-react";
import { useState } from "react";
import type { ManagementAuditEvent } from "@valet/contracts";

import { useProtectedDashboard } from "../../components/foundation/protected-dashboard-context";
import { useSelectedScope } from "../../components/foundation/selected-scope-provider";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { AuditDetailDrawer } from "./audit-detail-drawer";
import { auditCopy } from "./audit-copy";
import { auditErrorMessage } from "./audit-errors";
import { AuditFilters } from "./audit-filters";
import { AuditTable } from "./audit-table";
import { auditScopeKey } from "./audit-scope";
import styles from "./audit.module.css";
import { useAuditPage } from "./use-audit-page";

export function AuditPage() {
  const dashboard = useProtectedDashboard();
  const { selectionRevision } = useSelectedScope();
  const scopeKey = auditScopeKey({ ...dashboard, selectionRevision });
  return <AuditContent key={scopeKey} />;
}

function AuditContent() {
  const { locale } = useDashboardLocale();
  const t = auditCopy(locale);
  const audit = useAuditPage();
  const [selected, setSelected] = useState<ManagementAuditEvent | null>(null);
  const scopeLabel = audit.scope?.kind === "ORGANIZATION"
    ? t.organizationScope
    : t.locationScope;
  const showEventType = audit.scope?.role !== "SUPERVISOR";
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.heading}>
            <History aria-hidden="true" size={27} />
            <h1 className={styles.title}>{t.title}</h1>
          </div>
          <p className={styles.subtitle}>{t.subtitle}</p>
        </div>
        <span className={styles.scopeBadge}>{scopeLabel}</span>
      </div>
      <AuditFilters
        eventType={audit.eventType}
        onEventType={(value) => {
          setSelected(null);
          audit.setEventType(value);
        }}
        showEventType={showEventType}
        t={t}
      />
      {audit.loading ? <div className={styles.state} role="status">{t.loading}</div> : null}
      {audit.error ? (
        <div className={styles.error} role="alert">
          <span>{auditErrorMessage(audit.error, t)}</span>
          <button className={styles.secondary} onClick={audit.retry} type="button">{t.retry}</button>
        </div>
      ) : null}
      {!audit.loading && !audit.error && audit.data ? (
        <AuditTable
          canNext={audit.canNext}
          canPrevious={audit.canPrevious}
          items={audit.data.items}
          next={() => { setSelected(null); audit.next(); }}
          previous={() => { setSelected(null); audit.previous(); }}
          select={setSelected}
          t={t}
        />
      ) : null}
      {selected ? <AuditDetailDrawer event={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}
