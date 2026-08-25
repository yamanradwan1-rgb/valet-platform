"use client";

interface KpiStatProps {
  label: string;
  value: string | number;
  sub?: string | undefined;
  /** Optional accent color token (for example "var(--danger)"). */
  accentColor?: string | undefined;
}

/**
 * D1 KPI card: label, large tabular value, optional sub line. Values are
 * computed only from rows actually loaded from the backend snapshot.
 */
export function KpiStat({ label, value, sub, accentColor }: KpiStatProps) {
  return (
    <section className="card">
      <p className="overview-kpi-label">{label}</p>
      <p
        className="overview-kpi-value"
        style={accentColor === undefined ? undefined : { color: accentColor }}
      >
        {value}
      </p>
      {sub !== undefined && <p className="overview-kpi-sub">{sub}</p>}
    </section>
  );
}
