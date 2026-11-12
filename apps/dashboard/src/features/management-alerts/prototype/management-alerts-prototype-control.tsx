"use client";

import { useEffect, useState } from "react";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { AlertsPopover } from "./alerts-popover";
import { demoLocations, type DemoLocation } from "./fixtures";
import type { Connection, DemoRole, Scenario, Variant } from "./types";
import { useAlertLab } from "./use-alert-lab";
import { uxCopy } from "./ux-copy";
import "../management-alerts.css";
import "./alerts.css";

const scenarios: readonly Scenario[] = [
  "multiple", "one", "empty", "overflow", "destination-unavailable",
  "loading", "slow", "failure", "unavailable",
];
const roles: readonly DemoRole[] = ["company-admin", "location-manager", "unauthorized"];
const connections: readonly Connection[] = ["connected", "reconnecting", "offline", "revoked"];

export function ManagementAlertsPrototypeControl({ variant: initialVariant }: { readonly variant: Variant }) {
  const { locale } = useDashboardLocale();
  const t = uxCopy[locale];
  const lab = useAlertLab();
  const [variant, setVariant] = useState<Variant>(initialVariant);
  const [toolsOpen, setToolsOpen] = useState(false);
  const locations: readonly DemoLocation[] = ["downtown", "west", "north"];
  const roleLabels: Record<DemoRole, string> = {
    "company-admin": t.companyAdmin,
    "location-manager": t.locationManager,
    unauthorized: t.unauthorizedActor,
  };
  const connectionLabels: Record<Connection, string> = {
    connected: t.online,
    reconnecting: t.reconnecting,
    offline: t.offline,
    revoked: t.revoked,
  };

  useEffect(() => {
    function toggleTools(event: KeyboardEvent) {
      if (event.ctrlKey && event.shiftKey && !event.altKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        event.stopPropagation();
        setToolsOpen((current) => !current);
      }
    }
    window.addEventListener("keydown", toggleTools);
    return () => window.removeEventListener("keydown", toggleTools);
  }, []);

  return (
    <>
      <AlertsPopover
        locale={locale}
        role={lab.role}
        variant={variant}
        items={lab.attention}
        count={lab.count}
        status={lab.status}
        connection={lab.connection}
        open={lab.isOpen}
        onOpenChange={lab.setIsOpen}
        onSeen={lab.markSeen}
        seen={lab.seen}
        pendingId={lab.pendingId}
        seenFailure={lab.seenFailure}
        onRetry={lab.refresh}
      />
      {toolsOpen ? (
        <aside className="issue432-prototype-tools" dir={locale === "ar" ? "rtl" : "ltr"} aria-label={t.demoControl}>
          <div className="issue432-tools-heading">
            <strong>{t.demoControl}</strong>
            <button type="button" onClick={() => setToolsOpen(false)} aria-label={t.close}>×</button>
          </div>
          <div className="issue432-tools-grid">
            <label>
              {(t.variantA.split("·")[0] ?? "A").trim()} / {(t.variantB.split("·")[0] ?? "B").trim()}
              <select value={variant} onChange={(event) => setVariant(event.target.value as Variant)}>
                <option value="a">{t.variantA}</option>
                <option value="b">{t.variantB}</option>
              </select>
            </label>
            <label>
              {t.scenarios}
              <select value={lab.scenario} onChange={(event) => lab.selectScenario(event.target.value as Scenario)}>
                {scenarios.map((scenario) => <option key={scenario} value={scenario}>{t.scenarioNames[scenario]}</option>)}
              </select>
            </label>
            <label>
              {t.recent}
              <select value={lab.location} onChange={(event) => lab.selectLocation(event.target.value as keyof typeof demoLocations)}>
                {locations.map((location) => <option key={location} value={location}>{demoLocations[location][locale]}</option>)}
              </select>
            </label>
            <label>
              {t.actorRole}
              <select value={lab.role} onChange={(event) => lab.selectRole(event.target.value as DemoRole)}>
                {roles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
              </select>
            </label>
            <label>
              {t.connection}
              <select value={lab.connection} onChange={(event) => lab.selectConnection(event.target.value as Connection)}>
                {connections.map((connection) => <option key={connection} value={connection}>{connectionLabels[connection]}</option>)}
              </select>
            </label>
          </div>
          <div className="issue432-tools-actions">
            <button type="button" onClick={lab.addArrival}>{t.arrival}</button>
            <button type="button" onClick={lab.addOrganizationEvent} disabled={lab.role !== "company-admin"}>{t.organizationEvent}</button>
            <button type="button" onClick={lab.simulatePresenceExpiry}>{t.presenceExpiry}</button>
            <button type="button" onClick={lab.expireOccurrenceWindow}>{t.occurrenceExpiry}</button>
            <button type="button" onClick={lab.resolveActive}>{t.resolve}</button>
            <button type="button" onClick={lab.withdrawOccurrence}>{t.withdraw}</button>
            <button type="button" onClick={lab.crossThreshold}>{t.threshold}</button>
            <button type="button" onClick={lab.burst}>{t.burst}</button>
            <button type="button" onClick={lab.refresh}>{t.retry}</button>
            <button type="button" onClick={lab.reconnect}>{t.recover}</button>
          </div>
          <label>
            <input type="checkbox" checked={lab.failNextSeen} onChange={(event) => lab.setFailNextSeen(event.target.checked)} />
            {t.failure}
          </label>
          <p className="issue432-tools-note">{t.restricted} · {t.sourceDisclaimer}</p>
        </aside>
      ) : null}
    </>
  );
}
