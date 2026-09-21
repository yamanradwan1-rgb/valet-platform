"use client";

import type { ManagementIntegrationStatus } from "@valet/contracts";
import { Camera, Cpu, CreditCard, RefreshCw, Smartphone } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { useProtectedDashboard } from "../../../components/foundation/protected-dashboard-context";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { administrationCopy } from "../administration-copy";
import { administrationErrorMessage } from "../administration-error";
import { administrationScope, administrationScopeKey } from "../administration-scope";
import { AdministrationPage, ReadState, StatusBadge, styles } from "../administration-ui";
import { useAuthoritativeRead } from "../use-authoritative-read";
import { readIntegrations } from "./commercial-api";

const metadata = {
  PLATE_OCR: { icon: Camera, en: "Plate OCR", ar: "قراءة اللوحات" },
  STAFF_PUSH: { icon: Smartphone, en: "Staff Push", ar: "إشعارات الموظفين" },
  DIGITAL_PAYMENT: { icon: CreditCard, en: "Digital Payment", ar: "الدفع الرقمي" },
} as const;

const statusLabels: Record<ManagementIntegrationStatus, Readonly<{ en: string; ar: string }>> = {
  DISABLED: { en: "Disabled", ar: "معطّل" },
  UNAVAILABLE: { en: "Unavailable", ar: "غير متاح" },
  MISCONFIGURED: { en: "Misconfigured", ar: "إعداد غير صحيح" },
  DEGRADED: { en: "Degraded", ar: "متدهور" },
  OPERATIONAL: { en: "Operational", ar: "يعمل" },
  UNKNOWN: { en: "Unknown", ar: "غير معروف" },
};

export function IntegrationsPage() {
  const dashboard = useProtectedDashboard(); const scope = administrationScope(dashboard.selectedScope);
  const scopeKey = administrationScopeKey(dashboard); const { locale } = useDashboardLocale(); const t = administrationCopy(locale);
  const [selectedKey, setSelectedKey] = useState<"ALL" | keyof typeof metadata>("ALL");
  const [search, setSearch] = useState("");
  const load = useCallback((signal: AbortSignal) => readIntegrations(dashboard.api, scope.organizationId, signal), [dashboard.api, scope.organizationId]);
  const state = useAuthoritativeRead(`${scopeKey}:integrations`, load, scope.authority === "COMPANY_ADMIN");
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase(locale);
    return (state.data?.integrations ?? []).filter((item) => {
      if (selectedKey !== "ALL" && item.key !== selectedKey) return false;
      if (!needle) return true;
      const entry = metadata[item.key];
      return entry[locale].toLocaleLowerCase(locale).includes(needle) ||
        item.key.toLocaleLowerCase("en").includes(needle) ||
        statusLabels[item.status][locale].toLocaleLowerCase(locale).includes(needle);
    });
  }, [locale, search, selectedKey, state.data?.integrations]);
  if (scope.authority !== "COMPANY_ADMIN") return null;
  return <AdministrationPage icon={Cpu} subtitle={t.integrationsSubtitle} title={t.integrationsTitle}
    action={<button className={styles.secondary} disabled={state.loading} onClick={state.refresh} type="button"><RefreshCw size={15} /> {t.refresh}</button>}>
    <ReadState error={state.error ? new Error(administrationErrorMessage(state.error)) : null} loading={state.loading} onRetry={state.refresh}>
      <div className={styles.card} style={{ padding: "1rem" }}>
        <div className={styles.toolbar}>
          <div className={styles.actions}>
            <button aria-pressed={selectedKey === "ALL"} className={`${styles.filterChip} ${selectedKey === "ALL" ? styles.filterChipActive : ""}`} onClick={() => setSelectedKey("ALL")} type="button">{t.all}</button>
            {(Object.keys(metadata) as Array<keyof typeof metadata>).map((key) => (
              <button aria-pressed={selectedKey === key} className={`${styles.filterChip} ${selectedKey === key ? styles.filterChipActive : ""}`} key={key} onClick={() => setSelectedKey(key)} type="button">{metadata[key][locale]}</button>
            ))}
          </div>
          <input aria-label={t.searchIntegrations} className={styles.input} onChange={(event) => setSearch(event.target.value)} placeholder={t.searchIntegrations} style={{ maxWidth: "16rem" }} type="search" value={search} />
        </div>
      </div>
      {filtered.length === 0 ? <div className={`${styles.card} ${styles.empty}`}>{t.noData}</div> : null}
      <div className={styles.grid3}>{filtered.map((item) => { const entry = metadata[item.key]; const Icon = entry.icon; const badgeProps = item.status === "UNKNOWN" ? {} : { good: item.status === "OPERATIONAL" }; return <div className={`${styles.card} ${styles.integrationCard}`} key={item.key}>
        <div><div className={styles.toolbar}><div className={styles.actions}><span className={styles.integrationIcon}><Icon size={19} /></span><div><div className={styles.strong}>{entry[locale]}</div><bdi className={styles.muted} dir="ltr">{item.key}</bdi></div></div><StatusBadge {...badgeProps}>{statusLabels[item.status][locale]}</StatusBadge></div></div>
        <div className={styles.toolbar}><span className={styles.muted}>{t.currentStatus}</span><span className={styles.badge}>{t.readOnly}</span></div>
      </div>; })}</div>
    </ReadState>
  </AdministrationPage>;
}
