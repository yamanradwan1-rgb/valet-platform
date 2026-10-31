import { ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { useDashboardLocale } from "../../../../lib/i18n/locale-provider";
import { Fact, FactList, styles } from "../../operations-ui";
import { routeCopy, sampleTime } from "./route-copy";
import type { Sample } from "./route-history-api";
import s from "./route-history.module.css";

export function SampleInspector({
  samples,
  selected,
  onSelect,
  timezone,
}: {
  samples: Sample[];
  timezone: string;
  selected: number;
  onSelect: (index: number) => void;
}) {
  const { locale } = useDashboardLocale();
  const t = routeCopy(locale);
  const number = (v: number) =>
    v.toLocaleString(locale === "ar" ? "ar-JO" : "en-GB");
  const current = samples[selected]!;
  const Previous = locale === "ar" ? ChevronRight : ChevronLeft;
  const Next = locale === "ar" ? ChevronLeft : ChevronRight;
  return (
    <aside className={s.inspector} aria-label={t.inspect}>
      <div className={s.inspectorTitle}>
        <Clock3 size={15} aria-hidden="true" />
        <h3>{t.selected}</h3>
      </div>
      <div
        className={s.selectedCard}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span>
          {t.point} {number(selected + 1)} {t.of} {number(samples.length)}
        </span>
        <strong>
          <bdi>{sampleTime(current.capturedAt, locale, timezone)}</bdi>
        </strong>
        <span>
          {new Intl.DateTimeFormat(locale, {
            dateStyle: "medium",
            timeZone: timezone,
          }).format(new Date(current.capturedAt))}
        </span>
        <bdi dir="ltr" className={s.coordinates}>
          {Math.abs(current.latitude).toFixed(6)}°{" "}
          {current.latitude < 0 ? "S" : "N"}
          <br />
          {Math.abs(current.longitude).toFixed(6)}°{" "}
          {current.longitude < 0 ? "W" : "E"}
        </bdi>
      </div>
      <label className={s.rangeLabel}>
        {t.inspect}
        <input
          aria-label={t.inspect}
          dir="ltr"
          type="range"
          min={0}
          max={samples.length - 1}
          value={selected}
          disabled={samples.length === 1}
          aria-valuetext={`${t.point} ${selected + 1}, ${sampleTime(current.capturedAt, locale, timezone)}`}
          onChange={(event) => onSelect(Number(event.target.value))}
        />
      </label>
      <div className={s.stepButtons}>
        <button
          type="button"
          className={styles.secondary}
          aria-label={t.earlier}
          disabled={selected === 0}
          onClick={() => onSelect(selected - 1)}
        >
          <Previous size={16} />
        </button>
        <span>
          {number(selected + 1)} / {number(samples.length)}
        </span>
        <button
          type="button"
          className={styles.secondary}
          aria-label={t.later}
          disabled={selected === samples.length - 1}
          onClick={() => onSelect(selected + 1)}
        >
          <Next size={16} />
        </button>
      </div>
      <FactList>
        <Fact label={t.samples} value={number(samples.length)} />
        <Fact
          label={t.start}
          value={
            <bdi>{sampleTime(samples[0]!.capturedAt, locale, timezone)}</bdi>
          }
        />
        <Fact
          label={t.end}
          value={
            <bdi>
              {sampleTime(samples.at(-1)!.capturedAt, locale, timezone)}
            </bdi>
          }
        />
      </FactList>
      <p className={s.timezone}>{timezone}</p>
    </aside>
  );
}
