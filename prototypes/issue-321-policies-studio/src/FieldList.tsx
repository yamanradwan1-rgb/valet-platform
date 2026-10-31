import { useState } from "react";
import { Pencil, CheckCircle2 } from "lucide-react";
import { ContextHelp } from "@dashboard/features/help/context-help";
import {
  fieldDescription,
  type Field,
  type Scalar,
  type Locale,
} from "./catalog";
import { useStudio } from "./studio-context";
import { FieldEditor } from "./FieldEditor";
import { ui } from "./copy";
import { displayValue } from "./value-text";
import { plainGuidance } from "./setting-guidance";

export function FieldList({ fields }: { fields: Field[] }) {
  const {
    route,
    locale,
    defaults,
    overrides,
    editable,
    dirty,
    setDirty,
    identity,
  } = useStudio();
  const [editing, setEditing] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const copy = ui[locale];
  function open(key: string) {
    if (dirty && !window.confirm(copy.leave)) return;
    setDirty(false);
    setLastSaved(null);
    setEditing(key);
  }
  function close(saved = false) {
    setDirty(false);
    const id = editing;
    if (saved) setLastSaved(id);
    setEditing(null);
    requestAnimationFrame(() => document.getElementById(`edit-${id}`)?.focus());
  }
  return (
    <div className="ps-field-list">
      {fields.map((field) => {
        const isLocation = route.scope === "location";
        const override = overrides[field.key];
        const inherited =
          isLocation && (override === null || override === undefined);
        const effective =
          isLocation && !inherited ? override : defaults[field.key];
        const locationOnly = field.key === "slaTargetSeconds";
        return (
          <article
            className="ps-setting"
            key={field.key}
            data-setting={field.key}
            data-editing={editing === field.key}
          >
            <div className="ps-setting-summary">
              <div className="ps-setting-copy">
                <h3>{field.labels[locale]}</h3>
                <p>
                  {plainGuidance(field.key, locale) ??
                    fieldDescription(field, locale)}
                </p>
              </div>
              <div className="ps-setting-value">
                <span className="ps-value-label">
                  {locale === "ar" ? "القيمة الحالية" : "Current value"}
                </span>
                <strong>{displayValue(effective, field, locale)}</strong>
                <span className="ps-source">
                  {locationOnly
                    ? locale === "ar"
                      ? "خاص بالموقع"
                      : "Location only"
                    : inherited
                      ? copy.inherited
                      : isLocation
                        ? copy.override
                        : copy.default}
                </span>
              </div>
              <div className="ps-setting-tools">
                {editable && editing !== field.key ? (
                  <button
                    id={`edit-${field.key}`}
                    className="ps-edit-button"
                    type="button"
                    aria-label={`${copy.edit}: ${field.labels[locale]}`}
                    onClick={() => open(field.key)}
                  >
                    <Pencil size={15} aria-hidden="true" />
                    <span>{copy.edit}</span>
                  </button>
                ) : null}
                {field.help && editing !== field.key ? (
                  <ContextHelp
                    helpKey={field.help}
                    locale={locale}
                    scopeIdentity={identity}
                  />
                ) : null}
              </div>
            </div>
            {editing === field.key && (
              <FieldEditor
                field={field}
                effective={effective ?? null}
                inherited={inherited}
                onClose={close}
              />
            )}
            {lastSaved === field.key && (
              <p className="ps-row-saved">
                <CheckCircle2 size={14} aria-hidden="true" />
                {locale === "ar"
                  ? "تم الحفظ في المعاينة."
                  : "Saved in this preview."}
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}
