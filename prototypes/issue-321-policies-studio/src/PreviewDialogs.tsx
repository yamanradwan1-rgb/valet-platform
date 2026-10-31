import { FocusDialog } from "@dashboard/components/presentation/focus-dialog";
import { Button } from "@dashboard/components/presentation/button";
import { useStudio } from "./studio-context";
import { locations, organizations } from "./fixtures";
import type { PreviewRoute } from "./use-preview-route";
import { ui } from "./copy";

export function PreviewDialogs({
  dialog,
  onClose,
  onSelect,
}: {
  dialog: "organization" | "location" | "controls" | null;
  onClose: () => void;
  onSelect: (patch: Partial<PreviewRoute>) => void;
}) {
  const { route, locale } = useStudio();
  if (!dialog) return null;
  const ar = locale === "ar";
  const title =
    dialog === "controls"
      ? ui[locale].controls
      : dialog === "location"
        ? ar
          ? "اختيار موقع تجريبي"
          : "Select a demo location"
        : ar
          ? "اختيار شركة تجريبية"
          : "Select a demo organization";
  return (
    <FocusDialog label={title} onClose={onClose}>
      <div className="ps-dialog">
        <h2>{title}</h2>
        <p>
          {ar
            ? "أدوات محلية للنموذج فقط. لا تُثبت صلاحيات الخادم ولا تغيّر بيانات فعلية."
            : "Local prototype controls only. These do not prove backend authorization or change real data."}
        </p>
        {dialog === "location" ? (
          <div className="ps-choice-list">
            {locations.map((item) => (
              <Button
                key={item.id}
                variant="secondary"
                onClick={() => onSelect({ location: item.id })}
              >
                {item[locale]}
              </Button>
            ))}
            <Button
              variant="secondary"
              onClick={() => onSelect({ location: "none" })}
            >
              {ar ? "دون موقع محدد" : "No selected location"}
            </Button>
          </div>
        ) : null}
        {dialog === "organization" ? (
          <div className="ps-choice-list">
            {organizations.map((item) => (
              <Button
                key={item.id}
                variant="secondary"
                onClick={() => onSelect({ org: item.id, location: "garden" })}
              >
                {item[locale]}
              </Button>
            ))}
          </div>
        ) : null}
        {dialog === "controls" ? (
          <>
            <label>
              {ar ? "الدور التجريبي" : "Simulated role"}
              <select
                value={route.role}
                onChange={(event) =>
                  onSelect({
                    role: event.target.value as PreviewRoute["role"],
                    scope:
                      event.target.value === "LOCATION_MANAGER"
                        ? "location"
                        : "company",
                    section: "operations",
                  })
                }
              >
                <option value="COMPANY_ADMIN">
                  {ar ? "مسؤول الشركة" : "Company Admin"}
                </option>
                <option value="LOCATION_MANAGER">
                  {ar ? "مدير الموقع" : "Location Manager"}
                </option>
                <option value="DENIED">
                  {ar
                    ? "مشرف — دون وصول للإعدادات"
                    : "Supervisor — no settings access"}
                </option>
              </select>
            </label>
            <label>
              {ar ? "السيناريو" : "Scenario"}
              <select
                value={route.scenario}
                onChange={(event) => onSelect({ scenario: event.target.value })}
              >
                <option value="ready">{ar ? "بيانات متاحة" : "Ready"}</option>
                <option value="loading">{ar ? "تحميل" : "Loading"}</option>
                <option value="empty">{ar ? "فارغة" : "Empty"}</option>
                <option value="error">
                  {ar ? "خطأ قراءة وإعادة المحاولة" : "Read error & retry"}
                </option>
                <option value="denied">
                  {ar ? "رفض الوصول" : "Access denied"}
                </option>
                <option value="readonly">
                  {ar
                    ? "صلاحية الحضور للقراءة فقط — بيانات تجريبية"
                    : "Read-only presence capability — fixture"}
                </option>
              </select>
            </label>
            <p>
              {ar
                ? "اللغة والمظهر من أدوات لوحة الإدارة الأصلية. الأسماء والإحداثيات الافتراضية تجريبية."
                : "Language and theme use the original Dashboard controls. Default names and coordinates are synthetic."}
            </p>
          </>
        ) : null}
        <Button variant="secondary" onClick={onClose}>
          {ar ? "إغلاق" : "Close"}
        </Button>
      </div>
    </FocusDialog>
  );
}
