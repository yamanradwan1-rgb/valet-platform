"use client";

import type {
  LiveOperationsMapResponse,
  LocationMapArea,
  LocationMapPoint,
} from "@valet/contracts";

import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { operationsCopy } from "../operations-copy";
import { StatusBadge, styles } from "../operations-ui";

type LiveItem = LiveOperationsMapResponse["items"][number];

interface Coordinate {
  readonly latitude: number;
  readonly longitude: number;
}

function coordinateBounds(input: readonly Coordinate[]) {
  if (input.length === 0) return null;
  let minLat = input[0]!.latitude;
  let maxLat = minLat;
  let minLon = input[0]!.longitude;
  let maxLon = minLon;
  for (const item of input.slice(1)) {
    minLat = Math.min(minLat, item.latitude); maxLat = Math.max(maxLat, item.latitude);
    minLon = Math.min(minLon, item.longitude); maxLon = Math.max(maxLon, item.longitude);
  }
  return { minLat, maxLat, minLon, maxLon };
}

function projector(bounds: NonNullable<ReturnType<typeof coordinateBounds>>) {
  const latRange = bounds.maxLat - bounds.minLat;
  const lonRange = bounds.maxLon - bounds.minLon;
  return ({ latitude, longitude }: Coordinate) => ({
    x: lonRange === 0 ? 50 : 5 + ((longitude - bounds.minLon) / lonRange) * 90,
    y: latRange === 0 ? 50 : 95 - ((latitude - bounds.minLat) / latRange) * 90,
  });
}

export function CoordinateCanvas(props: {
  readonly areas?: readonly LocationMapArea[] | undefined;
  readonly items: readonly LiveItem[];
  readonly points?: readonly LocationMapPoint[] | undefined;
}) {
  const { locale } = useDashboardLocale();
  const t = operationsCopy(locale);
  const coordinates: Coordinate[] = [
    ...props.items.flatMap((item) => item.position ? [item.position] : []),
    ...(props.points ?? []),
    ...(props.areas ?? []).flatMap((area) => area.vertices),
  ];
  const bounds = coordinateBounds(coordinates);
  const project = bounds ? projector(bounds) : null;
  return (
    <div className={styles.mapCanvas} data-testid="coordinate-canvas">
      <div className={styles.mapNotice}><strong>{t.coordinateView}</strong> · {t.coordinateDisclaimer}</div>
      {project === null ? <div className={styles.state}>{t.noPosition}</div> : (
        <svg aria-label={t.coordinateView} className={styles.mapSvg} role="img" viewBox="0 0 100 100">
          {(props.areas ?? []).map((area) => (
            <polygon
              fill="rgba(30,96,240,.08)"
              key={area.id}
              points={area.vertices.map((vertex) => {
                const point = project(vertex);
                return `${point.x},${point.y}`;
              }).join(" ")}
              stroke="#1e60f0"
              strokeDasharray={area.active ? undefined : "2 2"}
              strokeWidth=".45"
            />
          ))}
          {(props.points ?? []).map((point) => {
            const p = project(point);
            return <circle cx={p.x} cy={p.y} fill={point.active ? "#1e60f0" : "#94a3b8"} key={point.id} r="1.4"><title>{point.label}: {point.latitude}, {point.longitude}</title></circle>;
          })}
          {props.items.flatMap((item) => {
            if (!item.position) return [];
            const point = project(item.position);
            return [<circle cx={point.x} cy={point.y} fill={item.position.freshness === "LIVE" ? "#059669" : "#f59e0b"} key={item.taskId} r="2"><title>{item.taskType} {item.taskId}: {item.position.latitude}, {item.position.longitude}</title></circle>];
          })}
        </svg>
      )}
    </div>
  );
}

export function PositionList({ items }: { readonly items: readonly LiveItem[] }) {
  const { locale } = useDashboardLocale();
  const t = operationsCopy(locale);
  return (
    <section className={styles.accessibleList} aria-label={t.listAlternative}>
      <h2 className={styles.sectionTitle}>{t.listAlternative}</h2>
      <div className={styles.list}>
        {items.map((item) => (
          <div className={styles.listItem} key={item.taskId}>
            <div className={styles.toolbar}><strong><bdi dir="ltr">{item.vehicle.plateNumber ?? item.vehicle.temporaryDescriptor ?? item.vehicle.vehicleId}</bdi></strong><StatusBadge tone={item.position?.freshness === "LIVE" ? "good" : item.position ? "warn" : "neutral"}>{item.position?.freshness ?? t.noPosition}</StatusBadge></div>
            <div className={styles.muted}><bdi dir="ltr">{item.taskType} · {item.taskId}</bdi></div>
            {item.position ? <div className={styles.muted}><bdi dir="ltr">{item.position.latitude}, {item.position.longitude}</bdi> · <bdi dir="ltr">{item.position.capturedAt}</bdi></div> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
