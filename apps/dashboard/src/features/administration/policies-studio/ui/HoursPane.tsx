import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "../../../../components/presentation/button";
import { ContextHelp } from "../../../../features/help/context-help";
import { weekdayLabel } from "../../../../features/administration/settings/settings-copy";
import type { StudioDay as Day } from "./studio-types";
import { useStudio } from "./studio-context";
import { visibleFields } from "./catalog";
import { FieldList } from "./FieldList";
import { ui } from "./copy";

export function HoursPane() {
  const { route, locale, adapter, setDirty, identity, announce } =
    useStudio();
  const ar = locale === "ar";
  const copy = ui[locale];
  const isLocation = route.scope === "location";
  const { effective, inherited } = adapter.hours;
  const blankDays: Day[] = [
    "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY",
    "FRIDAY", "SATURDAY", "SUNDAY",
  ].map((weekday) => ({ weekday, status: "CLOSED" }));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Day[]>(() =>
    structuredClone(effective ?? blankDays),
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const changed = JSON.stringify(draft) !== JSON.stringify(effective);
  function update(index: number, patch: Partial<Day>) {
    const next = draft.map((day, i) =>
      i === index ? { ...day, ...patch } : day,
    );
    setDraft(next);
    setDirty(JSON.stringify(next) !== JSON.stringify(effective));
  }
  async function save(clear = false) {
    if (saving || adapter.hours.busy || !adapter.hours.editable) return;
    if (
      !clear &&
      draft.some(
        (day) =>
          day.status === "OPEN" &&
          (!day.opensAt || !day.closesAt || day.opensAt >= day.closesAt),
      )
    ) {
      setError(
        ar
          ? "يجب أن يكون الإغلاق بعد الفتح في اليوم نفسه."
          : "Closing time must be after opening time on the same day.",
      );
      return;
    }
    const clean = draft.map((day) =>
      day.status === "CLOSED"
        ? { weekday: day.weekday, status: "CLOSED" as const }
        : day,
    );
    setSaving(true);
    try {
      const result = clear
        ? await adapter.hours.clear()
        : await adapter.hours.save(clean);
      if (!result.ok) {
        setError(result.message ?? copy.errorBody);
        return;
      }
      setDirty(false);
      setEditing(false);
      announce("");
      requestAnimationFrame(() => document.getElementById("edit-hours")?.focus());
    } catch {
      setError(copy.errorBody);
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <article className="ps-schedule">
        <div className="ps-related">
          <div>
            <h3>{ar ? "جدول الأسبوع" : "Weekly schedule"}</h3>
            <p>
              {ar
                ? "إرشادي فقط. لا يمنع الدخول أو الاسترجاع."
                : "Informational only. It does not block check-in or retrieval."}
            </p>
          </div>
          <ContextHelp
            helpKey="setting.operatingHours"
            locale={locale}
            scopeIdentity={identity}
          />
        </div>
        <div className="ps-schedule-meta">
          <CalendarDays size={17} aria-hidden="true" />
          <span>
              {isLocation
              ? (adapter.hours.timezone ?? (ar ? "المنطقة الزمنية للموقع" : "Location timezone"))
              : ar
                ? "الأوقات المحلية لكل موقع"
                : "Local times at each location"}
          </span>
          <span className="ps-source">
            {inherited
              ? copy.inherited
              : isLocation
                ? copy.override
                : copy.default}
          </span>
        </div>
        {editing && (
          <p className="ps-inline-note">
            {ar
              ? "مسودة غير مطبّقة. يبقى الجدول المحفوظ فعّالًا حتى الحفظ."
              : "Unapplied draft. The saved schedule remains effective until Save."}
          </p>
        )}
        <div className="ps-days">
          {(editing ? draft : (effective ?? [])).map((day, index) => (
            <div className="ps-day" key={day.weekday}>
              <strong>{weekdayLabel(day.weekday, locale)}</strong>
              {editing ? (
                <>
                  <select
                    aria-label={`${weekdayLabel(day.weekday, locale)} ${ar ? "الحالة" : "status"}`}
                    value={day.status}
                    onChange={(event) =>
                      update(index, {
                        status: event.target.value as Day["status"],
                        opensAt: day.opensAt ?? "08:00",
                        closesAt: day.closesAt ?? "23:00",
                      })
                    }
                  >
                    <option value="OPEN">{ar ? "مفتوح" : "Open"}</option>
                    <option value="CLOSED">{ar ? "مغلق" : "Closed"}</option>
                  </select>
                  {day.status === "OPEN" ? (
                    <div className="ps-time-pair">
                      <input
                        type="time"
                        dir="ltr"
                        aria-label={`${weekdayLabel(day.weekday, locale)} ${ar ? "الفتح" : "opens at"}`}
                        value={day.opensAt}
                        onChange={(event) =>
                          update(index, { opensAt: event.target.value })
                        }
                      />
                      <span>–</span>
                      <input
                        type="time"
                        dir="ltr"
                        aria-label={`${weekdayLabel(day.weekday, locale)} ${ar ? "الإغلاق" : "closes at"}`}
                        value={day.closesAt}
                        onChange={(event) =>
                          update(index, { closesAt: event.target.value })
                        }
                      />
                    </div>
                  ) : (
                    <span className="ps-source">{ar ? "مغلق" : "Closed"}</span>
                  )}
                </>
              ) : (
                <span>
                  {day.status === "CLOSED" ? (
                    ar ? (
                      "مغلق"
                    ) : (
                      "Closed"
                    )
                  ) : (
                    <bdi>
                      {day.opensAt} — {day.closesAt}
                    </bdi>
                  )}
                </span>
              )}
            </div>
          ))}
        </div>
        {!effective && !editing && (
          <p>{ar ? "لا يوجد جدول محفوظ." : "No saved schedule."}</p>
        )}
        {error && (
          <p className="ps-error" role="alert">
            {error}
          </p>
        )}
        <div className="ps-actions ps-schedule-actions">
          {editing ? (
            <>
              <Button onClick={() => void save()} disabled={!changed || saving || adapter.hours.busy}>
                {copy.save}
              </Button>
              <ContextHelp
                helpKey="setting.operatingHours"
                locale={locale}
                scopeIdentity={identity}
              />
              {isLocation && !inherited && (
                <Button variant="secondary" disabled={saving} onClick={() => void save(true)}>
                  {copy.clear}
                </Button>
              )}
              {!isLocation && effective && (
                <Button variant="secondary" disabled={saving} onClick={() => void save(true)}>
                  {ar ? "مسح الجدول" : "Clear schedule"}
                </Button>
              )}
              <Button
                variant="quiet"
                onClick={() => {
                  if (changed && !window.confirm(copy.leave)) return;
                  setDirty(false);
                  setEditing(false);
                  setDraft(structuredClone(effective ?? blankDays));
                }}
              >
                {copy.cancel}
              </Button>
            </>
          ) : (
            <Button
              id="edit-hours"
              variant="secondary"
              disabled={!adapter.hours.editable}
              onClick={() => {
                setEditing(true);
                setDraft(structuredClone(effective ?? blankDays));
              }}
            >
              {ar ? "تعديل الجدول" : "Edit schedule"}
            </Button>
          )}
        </div>
      </article>
      {!editing && (
        <FieldList fields={visibleFields("hours", route.role, route.scope)} />
      )}
    </>
  );
}
