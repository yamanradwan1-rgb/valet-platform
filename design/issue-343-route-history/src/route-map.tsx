import { useEffect, useMemo, useRef, useState } from 'react';
import { LocateFixed, Minus, Plus, Navigation2 } from 'lucide-react';
import { useDashboardLocale } from '@dashboard/lib/i18n/locale-provider';
import { styles } from '@dashboard/features/operations/operations-ui';
import { routeCopy, sampleTime } from './route-copy';
import type { Sample } from './route-fixtures';
import s from './route-history.module.css';

interface Point { x: number; y: number; sample: Sample; index: number }

function project(samples: Sample[], width: number, height: number): Point[] {
  const latitudes = samples.map((p) => p.latitude);
  const longitudes = samples.map((p) => p.longitude);
  const minLat = Math.min(...latitudes), maxLat = Math.max(...latitudes);
  const minLon = Math.min(...longitudes), maxLon = Math.max(...longitudes);
  const middleLat = (minLat + maxLat) / 2, middleLon = (minLon + maxLon) / 2;
  const correction = Math.cos(middleLat * Math.PI / 180);
  const scale = Math.min((width - 110) / Math.max((maxLon - minLon) * correction, 0.0001),
    (height - 120) / Math.max(maxLat - minLat, 0.0001));
  return samples.map((sample, index) => ({
    x: width / 2 + (sample.longitude - middleLon) * correction * scale,
    y: height / 2 - (sample.latitude - middleLat) * scale,
    sample, index,
  }));
}

export default function RouteMap({ samples, selected, onSelect }: {
  samples: Sample[]; selected: number; onSelect: (index: number) => void;
}) {
  const { locale } = useDashboardLocale();
  const t = routeCopy(locale);
  const host = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const [size, setSize] = useState({ width: 640, height: 440 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const points = useMemo(() => project(samples, size.width, size.height), [samples, size]);
  const segments = useMemo(() => {
    const groups: Point[][] = [];
    for (const point of points) {
      if (groups.at(-1)?.at(-1)?.sample.segment !== point.sample.segment) groups.push([]);
      groups.at(-1)!.push(point);
    }
    return groups;
  }, [points]);
  const selectedPoint = points[selected]!;
  const stride = Math.max(1, Math.ceil(points.length / 28));
  // Render endpoints last so nearby sample hit areas cannot cover Start/End.
  const displayed = [
    ...points.filter((_, i) => i > 0 && i < points.length - 1 && i % stride === 0),
    ...points.filter((_, i) => i === 0 || i === points.length - 1),
  ];
  const arrowStride = Math.max(3, Math.ceil(points.length / 6));
  return (
    <div className={s.map} ref={host}>
      <svg className={s.mapSvg} viewBox={`0 0 ${size.width} ${size.height}`} role="group" aria-label={t.mapLabel}
        onPointerDown={(event) => {
          if ((event.target as Element).closest('[role="button"]')) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { x: event.clientX, y: event.clientY, offsetX: pan.x, offsetY: pan.y };
        }}
        onPointerMove={(event) => {
          if (drag.current) setPan({ x: drag.current.offsetX + event.clientX - drag.current.x,
            y: drag.current.offsetY + event.clientY - drag.current.y });
        }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        <defs>
          <pattern id="route-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" className={s.gridLine} fill="none" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#route-grid)" />
        <g transform={`translate(${size.width / 2 + pan.x},${size.height / 2 + pan.y}) scale(${zoom}) translate(${-size.width / 2},${-size.height / 2})`}>
          {segments.map((segment, i) => (
            <g key={i}>
              <polyline points={segment.map((p) => `${p.x},${p.y}`).join(' ')} className={s.routeHalo} />
              <polyline data-route-segment={i} points={segment.map((p) => `${p.x},${p.y}`).join(' ')} className={s.routeLine} />
            </g>
          ))}
          {points.map((point, i) => {
            const next = points[i + 1];
            if (!next || i % arrowStride !== 1 || next.sample.segment !== point.sample.segment) return null;
            const angle = Math.atan2(next.y - point.y, next.x - point.x) * 180 / Math.PI;
            return <path key={i} d="M -4 -4 L 1 0 L -4 4" className={s.travelArrow}
              transform={`translate(${(point.x + next.x) / 2},${(point.y + next.y) / 2}) rotate(${angle})`} />;
          })}
          <circle cx={selectedPoint.x} cy={selectedPoint.y} r={18 / zoom} className={s.selectionRing} pointerEvents="none" />
          {displayed.map((point) => {
            const endpoint = points.length > 1 && (point.index === 0 || point.index === points.length - 1);
            const label = endpoint ? point.index === 0 ? t.startPin : t.endPin : `${t.point} ${point.index + 1}`;
            return (
              <g key={point.index} role="button" tabIndex={0} className={s.sampleTarget}
                aria-label={`${label}, ${sampleTime(point.sample.capturedAt, locale)}`}
                aria-pressed={selected === point.index}
                onClick={() => onSelect(point.index)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(point.index); }
                }}>
                <title>{label} · {sampleTime(point.sample.capturedAt, locale)}</title>
                <circle cx={point.x} cy={point.y} r={22 / zoom} fill="transparent" />
                <circle cx={point.x} cy={point.y} r={(endpoint ? 12 : 3.5) / zoom}
                  className={endpoint ? point.index === 0 ? s.startMarker : s.endMarker : s.sampleDot} />
                {endpoint ? <text x={point.x} y={point.y + 3.5 / zoom} textAnchor="middle"
                  className={point.index === 0 ? s.startText : s.endText} fontSize={10 / zoom}>{point.index === 0 ? 'A' : 'B'}</text> : null}
              </g>
            );
          })}
          {selected > 0 && selected < points.length - 1 ? <circle cx={selectedPoint.x} cy={selectedPoint.y} r={5 / zoom} className={s.selectedDot} pointerEvents="none" /> : null}
        </g>
      </svg>
      <div className={s.north} title={t.north}><Navigation2 size={16} aria-hidden="true" /><span aria-label={t.north}>N</span></div>
      <div className={s.mapTools}>
        <button className={styles.secondary} type="button" aria-label={t.zoomIn} disabled={zoom >= 4} onClick={() => setZoom((v) => Math.min(4, v + 0.5))}><Plus size={17} /></button>
        <button className={styles.secondary} type="button" aria-label={t.zoomOut} disabled={zoom <= 1} onClick={() => setZoom((v) => Math.max(1, v - 0.5))}><Minus size={17} /></button>
        <button className={styles.secondary} type="button" aria-label={t.fit} onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><LocateFixed size={17} /></button>
      </div>
      <span className={s.coordinateLabel} dir="ltr">{samples[0]!.latitude.toFixed(5)}° N · {samples[0]!.longitude.toFixed(5)}° E</span>
    </div>
  );
}
