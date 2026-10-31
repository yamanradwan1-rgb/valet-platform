import { displayValue } from "./value-text";
import { useStudio } from "./studio-context";
import { ui } from "./copy";
import type { Field, Scalar } from "./catalog";

export function EditorContext({
  field,
  effective,
  inherited,
  source,
  onSourceChange,
}: {
  field: Field;
  effective: Scalar;
  inherited: boolean;
  source: string;
  onSourceChange: (value: string) => void;
}) {
  const { route, locale, adapter } = useStudio();
  const values = field.section === "presence"
    ? adapter.presence.values
    : adapter.settings;
  const { defaults, overrides } = values;
  const copy = ui[locale];
  const ar = locale === "ar";
  const isLocation = route.scope === "location";
  const locationOnly = field.key === "slaTargetSeconds";
  return (
    <details className="ps-editor-context">
      <summary>
        {ar ? "القيم المحفوظة والوراثة" : "Saved values & inheritance"}
      </summary>
      <div className="ps-value-context">
        {!locationOnly && (
          <div>
            <span>{copy.default}</span>
            <strong>{displayValue(defaults[field.key], field, locale)}</strong>
          </div>
        )}
        <div>
          <span>{copy.saved}</span>
          <strong>
            {isLocation && inherited
              ? copy.inherited
              : displayValue(
                  isLocation ? overrides[field.key] : defaults[field.key],
                  field,
                  locale,
                )}
          </strong>
        </div>
        <div>
          <span>{copy.effective}</span>
          <strong>{displayValue(effective, field, locale)}</strong>
        </div>
      </div>
      {isLocation && !locationOnly && (
        <label>
          {ar ? "مصدر الإعداد" : "Setting source"}
          <select
            aria-label={ar ? "مصدر الإعداد" : "Setting source"}
            value={source}
            onChange={(event) => onSourceChange(event.target.value)}
          >
            <option value="inherit">
              {ar ? "استخدام قيمة الشركة" : "Inherit company default"}
            </option>
            <option value="custom">
              {ar ? "تخصيص لهذا الموقع" : "Customize for this location"}
            </option>
          </select>
        </label>
      )}
    </details>
  );
}
