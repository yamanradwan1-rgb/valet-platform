import { useState, type CSSProperties } from "react";

import { BidiText } from "../../components/presentation/panel";
import type { DashboardLocale } from "../../lib/i18n/locale";
import { analyticsCopy } from "./analytics-copy";
import type { AnalyticsDurationPresentation } from "./analytics-presentation";
import {
  durationLabel,
  durationShortLabel,
  DurationTextSummary,
} from "./analytics-text-summary";
import styles from "./analytics.module.css";

const WIDTH = 500;
const HEIGHT = 260;
const PADDING = { left: 40, right: 20, top: 20, bottom: 30 } as const;

const chartWrapStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  minHeight: HEIGHT,
  userSelect: "none",
};
const chartStyle: CSSProperties = {
  width: "100%",
  height: HEIGHT,
  display: "block",
  overflow: "visible",
};
const gridLineStyle: CSSProperties = {
  stroke: "var(--analytics-grid)",
  strokeWidth: 1,
  strokeDasharray: "4 4",
};
const axisStyle: CSSProperties = {
  fill: "#94a3b8",
  fontFamily: 'Inter, "Segoe UI", sans-serif',
  fontSize: 11,
};
const xAxisStyle: CSSProperties = { ...axisStyle, fill: "#64748b" };
const emptyStyle: CSSProperties = {
  minHeight: HEIGHT,
  padding: "1.5rem",
  color: "var(--analytics-muted)",
  fontSize: "0.8125rem",
  textAlign: "center",
  display: "grid",
  placeItems: "center",
  alignContent: "center",
};
const tooltipStyle: CSSProperties = {
  position: "absolute",
  zIndex: 20,
  padding: "0.25rem 0.625rem",
  borderRadius: "0.25rem",
  background: "var(--analytics-tooltip-bg)",
  boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
  color: "var(--analytics-tooltip-fg)",
  fontSize: "0.75rem",
  lineHeight: "1rem",
  pointerEvents: "none",
  transform: "translate(-50%, -2rem)",
  whiteSpace: "nowrap",
};

interface ChartPoint extends AnalyticsDurationPresentation {
  readonly x: number;
  readonly y: number | null;
  readonly numericValue: number | null;
}

function durationCoordinates(data: readonly AnalyticsDurationPresentation[]) {
  const values = data.flatMap((point) => point.averageSeconds === null
    ? []
    : [Number(point.averageSeconds)]);
  const maximum = Math.max(1, ...values);
  const axisMaximum = Math.max(4, Math.ceil(maximum / 4) * 4);
  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const points: ChartPoint[] = data.map((point, index) => {
    const numericValue = point.averageSeconds === null ? null : Number(point.averageSeconds);
    const x = data.length === 1
      ? PADDING.left + plotWidth / 2
      : PADDING.left + (index / (data.length - 1)) * plotWidth;
    return {
      ...point,
      numericValue,
      x,
      y: numericValue === null
        ? null
        : PADDING.top + plotHeight - (numericValue / axisMaximum) * plotHeight,
    };
  });
  return { axisMaximum, points } as const;
}

function contiguousSegments(points: readonly ChartPoint[]): readonly (readonly ChartPoint[])[] {
  const result: ChartPoint[][] = [];
  let current: ChartPoint[] = [];
  for (const point of points) {
    if (point.y === null) {
      if (current.length > 0) result.push(current);
      current = [];
    } else {
      current.push(point);
    }
  }
  if (current.length > 0) result.push(current);
  return result;
}

function smoothPath(points: readonly ChartPoint[]): string {
  const first = points[0];
  if (!first || first.y === null) return "";
  let path = `M ${first.x} ${first.y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index]!;
    const next = points[index + 1]!;
    if (current.y === null || next.y === null) continue;
    const middleX = (current.x + next.x) / 2;
    path += ` C ${middleX} ${current.y}, ${middleX} ${next.y}, ${next.x} ${next.y}`;
  }
  return path;
}

export function AnalyticsSecondaryChart(props: {
  readonly data: readonly AnalyticsDurationPresentation[];
  readonly locale: DashboardLocale;
}) {
  const t = analyticsCopy(props.locale);
  const [hovered, setHovered] = useState<number | null>(null);
  const hasSamples = props.data.some((point) => point.averageSeconds !== null);
  if (!hasSamples) {
    return (
      <div data-testid="analytics-duration-chart">
        <div style={emptyStyle}>{t.noDurations}</div>
        <DurationTextSummary data={props.data} locale={props.locale} />
      </div>
    );
  }
  const { axisMaximum, points } = durationCoordinates(props.data);
  const ticks = [0, 1, 2, 3, 4].map((step) => axisMaximum * step / 4);
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const baseline = HEIGHT - PADDING.bottom;
  const segments = contiguousSegments(points);
  return (
    <div data-testid="analytics-duration-chart" style={chartWrapStyle}>
      <svg aria-label={t.durationComparison} role="img" style={chartStyle} viewBox="0 0 500 260">
        <defs>
          <linearGradient id="md05-analytics-duration-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#1E60F0" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#1E60F0" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {ticks.map((tick) => {
          const y = PADDING.top + plotHeight * (1 - tick / axisMaximum);
          return (
            <g key={tick}>
              <line style={gridLineStyle} x1={PADDING.left} x2={WIDTH - PADDING.right} y1={y} y2={y} />
              <text style={axisStyle} textAnchor="end" x="33" y={y + 4}>{tick}</text>
            </g>
          );
        })}
        {segments.map((segment) => {
          const path = smoothPath(segment);
          const first = segment[0]!;
          const last = segment.at(-1)!;
          const area = segment.length > 1
            ? `${path} L ${last.x} ${baseline} L ${first.x} ${baseline} Z`
            : "";
          return (
            <g key={segment.map((point) => point.key).join("-")}>
              {area ? <path d={area} fill="url(#md05-analytics-duration-area)" /> : null}
              <path className={styles.chartLine} d={path} fill="none" />
            </g>
          );
        })}
        {points.map((point, index) => (
          <g key={point.key} style={{ cursor: "pointer" }}>
            <text className={styles.chartAxisX} style={xAxisStyle} textAnchor="middle" x={point.x} y={HEIGHT - 8}>
              {durationShortLabel(point.key, props.locale)}
            </text>
            {point.y === null ? null : (
              <>
                <circle className={styles.chartPoint} cx={point.x} cy={point.y} r={hovered === index ? 6 : 4} />
                <circle
                  cx={point.x}
                  cy={point.y}
                  fill="transparent"
                  onMouseEnter={() => setHovered(index)}
                  onMouseLeave={() => setHovered(null)}
                  r="16"
                />
              </>
            )}
          </g>
        ))}
      </svg>
      {hovered !== null && points[hovered]?.averageSeconds !== null ? (
        <div
          style={{
            ...tooltipStyle,
            left: `${(points[hovered]!.x / WIDTH) * 100}%`,
            top: `${(points[hovered]!.y! / HEIGHT) * 100}%`,
          }}
        >
          {durationLabel(points[hovered]!.key, props.locale)}{" · "}
          <BidiText kind="number">{points[hovered]!.averageSeconds}</BidiText> {t.seconds}
        </div>
      ) : null}
      <DurationTextSummary data={props.data} locale={props.locale} />
    </div>
  );
}
