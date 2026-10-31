import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "@dashboard/components/presentation/button";
import { ContextHelp } from "@dashboard/features/help/context-help";
import { weekdayLabel } from "@dashboard/features/administration/settings/settings-copy";
import { fixtureHours, companyKey, locationKey, type Day } from "./fixtures";
import { useStudio } from "./studio-context";
import { visibleFields } from "./catalog";
import { FieldList } from "./FieldList";
import { ui } from "./copy";

export function HoursPane() {
  const { route, locale, store, updateStore, setDirty, identity, announce } =
    useStudio();
  const ar = locale === "ar";
  const copy = ui[locale];
  const isLocation = route.scope === "location";
  const company = companyKey(route.org);
  const key = isLocation ? locationKey(route.org, route.location) : company;
  const defaultSchedule = Object.hasOwn(store.schedules, company)
    ? store.schedules[company]
    : fixtureHours;
  const saved = store.schedules[key];
  const inherited = isLocation && (saved === undefined || saved === null);
  const effective = inherited
    ? defaultSchedule
    : saved === undefined
      ? fixtureHours
      : saved;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Day[]>(() =>
    structuredClone(
      effective ??
        fixtureHours.map((day) => ({
          weekday: day.weekday,
          status: "CLOSED" as const,
        })),
    ),
  );
  const [error, setError] = useState("");
  const changed = JSON.stringify(draft) !== JSON.stringify(effective);
  function update(index: number, patch: Partial<Day>) {
    const next = draft.map((day, i) =>
      i === index ? { ...day, ...patch } : day,
    );
    setDraft(next);
    setDirty(JSON.stringify(next) !== JSON.stringify(effective));
  }
  function save(clear = false) {
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
    updateStore((old) => ({
      ...old,
      schedules: { ...old.schedules, [key]: clear ? null : clean },
    }));
    setDirty(false);
    setEditing(false);
    announce(copy.localSave);
    requestAnimationFrame(() => document.getElementById("edit-hours")?.focus());
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
              ? "Asia/Amman"
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
              <Button onClick={() => save()} disabled={!changed}>
                {copy.save}
              </Button>
              <ContextHelp
                helpKey="setting.operatingHours"
                locale={locale}
                scopeIdentity={identity}
              />
              {isLocation && !inherited && (
                <Button variant="secondary" onClick={() => save(true)}>
                  {copy.clear}
                </Button>
              )}
              {!isLocation && effective && (
                <Button variant="secondary" onClick={() => save(true)}>
                  {ar ? "مسح الجدول" : "Clear schedule"}
                </Button>
              )}
              <Button
                variant="quiet"
                onClick={() => {
                  if (changed && !window.confirm(copy.leave)) return;
                  setDirty(false);
                  setEditing(false);
                  setDraft(structuredClone(effective ?? fixtureHours));
                }}
              >
                {copy.cancel}
              </Button>
            </>
          ) : (
            <Button
              id="edit-hours"
              variant="secondary"
              onClick={() => {
                setEditing(true);
                setDraft(structuredClone(effective ?? fixtureHours));
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
