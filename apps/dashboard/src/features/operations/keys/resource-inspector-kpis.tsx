import type { InspectorOverview } from "./resource-inspector-contract";
import type { inspectorCopy } from "./resource-inspector-copy";

type Copy = ReturnType<typeof inspectorCopy>;

export function ResourceInspectorKpis(props: {
  readonly counts: InspectorOverview["counts"] | null;
  readonly t: Copy;
}) {
  const { counts, t } = props;
  const figures = [
    { id: "keys-active", family: "keys", label: t.activeKeySlots, value: counts?.keySlots.active, caption: `${counts?.keySlots.configured ?? "—"} ${t.configuredCount}` },
    { id: "keys-available", family: "keys", label: t.keysAvailable, value: counts?.keySlots.available, caption: `${t.ofActiveCount} ${counts?.keySlots.active ?? "—"} ${t.activeCount}` },
    { id: "keys-in-use", family: "keys", label: t.keysInUse, value: counts?.keySlots.inUse, caption: t.inUse },
    { id: "spots-active", family: "spots", label: t.activeParkingSpots, value: counts?.parkingSpots.active, caption: `${counts?.parkingSpots.configured ?? "—"} ${t.configuredCount}` },
    { id: "spots-available", family: "spots", label: t.spotsAvailable, value: counts?.parkingSpots.available, caption: `${t.ofActiveCount} ${counts?.parkingSpots.active ?? "—"} ${t.activeCount}` },
    { id: "spots-occupied", family: "spots", label: t.spotsOccupied, value: counts?.parkingSpots.occupied, caption: t.occupied },
  ] as const;
  return (
    <section className="c-kpis" aria-label={t.kpiSummary}>
      {figures.map((figure) => (
        <div className="c-kpi" data-c-kpi={figure.id} data-c-kpi-family={figure.family} key={figure.id}>
          <span className="c-kpi-label">{figure.label}</span>
          <strong className="c-kpi-number" data-c-kpi-value>
            {figure.value ?? "—"}
          </strong>
          <span className="c-kpi-context">{figure.caption}</span>
        </div>
      ))}
    </section>
  );
}
