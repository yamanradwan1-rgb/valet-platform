import { useState, type CSSProperties } from "react";

import { BidiText } from "../../components/presentation/panel";
import type { DashboardLocale } from "../../lib/i18n/locale";
import { analyticsCopy } from "./analytics-copy";
import { ActivityTextSummary } from "./analytics-text-summary";
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

type ActivityPoint = { readonly date: string; readonly handledCount: number };

function activityCoordinates(data: readonly ActivityPoint[]) {
  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const maximum = Math.max(1, ...data.map((point) => point.handledCount));
  const axisMaximum = Math.max(4, Math.ceil(maximum / 4) * 4);
  const slotWidth = plotWidth / data.length;
  const barWidth = Math.min(32, Math.max(4, slotWidth * 0.6));
  return data.map((point, index) => {
    const height = (point.handledCount / axisMaximum) * plotHeight;
    return {
      ...point,
      axisMaximum,
      barWidth,
      x: PADDING.left + index * slotWidth + (slotWidth - barWidth) / 2,
      y: PADDING.top + plotHeight - height,
      height,
      centerX: PADDING.left + index * slotWidth + slotWidth / 2,
    };
  });
}

export function AnalyticsActivityChart(props: {
  readonly data: readonly ActivityPoint[];
  readonly locale: DashboardLocale;
}) {
  const t = analyticsCopy(props.locale);
  const [hovered, setHovered] = useState<number | null>(null);
  if (props.data.length === 0) {
    return (
      <div data-testid="analytics-activity-chart">
        <div style={emptyStyle}>{t.noActivity}</div>
        <ActivityTextSummary data={props.data} locale={props.locale} />
      </div>
    );
  }
  const points = activityCoordinates(props.data);
  const axisMaximum = points[0]!.axisMaximum;
  const ticks = [0, 1, 2, 3, 4].map((step) => Math.round(axisMaximum * step / 4));
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const labelStep = Math.max(1, Math.ceil(props.data.length / 7));
  return (
    <div data-testid="analytics-activity-chart" style={chartWrapStyle}>
      <svg aria-label={t.vehicleActivity} role="img" style={chartStyle} viewBox="0 0 500 260">
        {ticks.map((tick) => {
          const y = PADDING.top + plotHeight * (1 - tick / axisMaximum);
          return (
            <g key={tick}>
              <line style={gridLineStyle} x1={PADDING.left} x2={WIDTH - PADDING.right} y1={y} y2={y} />
              <text style={axisStyle} textAnchor="end" x="33" y={y + 4}>{tick}</text>
            </g>
          );
        })}
        <text style={axisStyle} textAnchor="middle" transform="rotate(-90 12 130)" x="12" y="130">
          {t.carsHandled}
        </text>
        {points.map((point, index) => (
          <g key={point.date} style={{ cursor: "pointer" }}>
            <rect
              fill={hovered === index ? "#1551ca" : "#1e60f0"}
              height={point.height}
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
              rx="4"
              style={{ transition: "fill 150ms ease" }}
              width={point.barWidth}
              x={point.x}
              y={point.y}
            />
            {(index % labelStep === 0 || index === points.length - 1) ? (
              <text className={styles.chartAxisX} style={xAxisStyle} textAnchor="middle" x={point.centerX} y={HEIGHT - 8}>
                {point.date.slice(5)}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      {hovered !== null ? (
        <div
          style={{
            ...tooltipStyle,
            left: `${(points[hovered]!.centerX / WIDTH) * 100}%`,
            top: `${(points[hovered]!.y / HEIGHT) * 100}%`,
          }}
        >
          <BidiText kind="number">{points[hovered]!.handledCount}</BidiText>
          {" · "}
          <BidiText>{points[hovered]!.date}</BidiText>
        </div>
      ) : null}
      <ActivityTextSummary data={props.data} locale={props.locale} />
    </div>
  );
}
