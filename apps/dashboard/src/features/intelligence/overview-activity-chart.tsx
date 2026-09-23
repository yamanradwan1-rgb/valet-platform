import type { OperationalAnalyticsResponse } from "@valet/contracts";
import { useState } from "react";

import { BidiText } from "../../components/presentation/panel";
import type { DashboardLocale } from "../../lib/i18n/locale";
import { overviewCopy } from "./overview-copy";
import styles from "./overview-chart.module.css";

type ActivityPoint = OperationalAnalyticsResponse["carsHandledPerDay"][number];

function coordinates(data: readonly ActivityPoint[]) {
  const width = 540;
  const height = 260;
  const padding = { left: 35, right: 20, top: 20, bottom: 30 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maximum = Math.max(1, ...data.map((point) => point.handledCount));
  const axisMaximum = Math.max(4, Math.ceil(maximum / 4) * 4);
  return data.map((point, index) => ({
    ...point,
    x: data.length === 1
      ? padding.left + plotWidth / 2
      : padding.left + (index / (data.length - 1)) * plotWidth,
    y: padding.top + plotHeight - (point.handledCount / axisMaximum) * plotHeight,
    axisMaximum,
    height,
    padding,
    width,
  }));
}

export function OverviewActivityChart({
  data,
  locale,
}: {
  readonly data: readonly ActivityPoint[];
  readonly locale: DashboardLocale;
}) {
  const t = overviewCopy(locale);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  if (data.length === 0) {
    return <div className={styles.chartEmpty}>{t.noActivity}</div>;
  }

  const points = coordinates(data);
  const first = points[0]!;
  const baseline = first.height - first.padding.bottom;
  let linePath = `M ${first.x} ${first.y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index]!;
    const next = points[index + 1]!;
    const middleX = (current.x + next.x) / 2;
    linePath += ` C ${middleX} ${current.y}, ${middleX} ${next.y}, ${next.x} ${next.y}`;
  }
  const areaPath = `${linePath} L ${points.at(-1)!.x} ${baseline} L ${first.x} ${baseline} Z`;
  const ticks = [0, 1, 2, 3, 4].map((step) =>
    Math.round((first.axisMaximum * step) / 4),
  );
  const labelStep = Math.max(1, Math.ceil(points.length / 6));

  return (
    <div className={styles.chartWrap}>
      <svg aria-label={t.activity} className={styles.chart} role="img" viewBox="0 0 540 260">
        <defs>
          <linearGradient id="md05-overview-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#1E60F0" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#1E60F0" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {ticks.map((tick) => {
          const y = first.padding.top +
            (first.height - first.padding.top - first.padding.bottom) *
              (1 - tick / first.axisMaximum);
          return (
            <g key={tick}>
              <line
                className={styles.chartGridLine}
                x1={first.padding.left}
                x2={first.width - first.padding.right}
                y1={y}
                y2={y}
              />
              <text className={styles.chartAxis} textAnchor="end" x="29" y={y + 4}>
                {tick}
              </text>
            </g>
          );
        })}
        <path d={areaPath} fill="url(#md05-overview-area)" />
        <path className={styles.chartLine} d={linePath} fill="none" />
        {points.map((point, index) => (
          <g className={styles.chartTarget} key={point.date}>
            {(index % labelStep === 0 || index === points.length - 1) ? (
              <text className={styles.chartAxis} textAnchor="middle" x={point.x} y={first.height - 9}>
                {point.date.slice(5)}
              </text>
            ) : null}
            <circle
              className={styles.chartPoint}
              cx={point.x}
              cy={point.y}
              r={hoveredIndex === index ? 6 : 4}
            />
            <circle
              cx={point.x}
              cy={point.y}
              fill="transparent"
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              r="16"
            />
          </g>
        ))}
      </svg>
      {hoveredIndex !== null ? (
        <div
          className={styles.chartTooltip}
          style={{
            left: `${(points[hoveredIndex]!.x / first.width) * 100}%`,
            top: `${(points[hoveredIndex]!.y / first.height) * 100}%`,
          }}
        >
          <BidiText kind="number">{points[hoveredIndex]!.handledCount}</BidiText>
          {" · "}
          <BidiText>{points[hoveredIndex]!.date}</BidiText>
        </div>
      ) : null}
      <table className={styles.visuallyHidden}>
        <caption>{t.activity}</caption>
        <thead><tr><th>{t.selectedPeriod}</th><th>{t.carsHandled}</th></tr></thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.date}>
              <td><BidiText>{point.date}</BidiText></td>
              <td><BidiText kind="number">{point.handledCount}</BidiText></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
