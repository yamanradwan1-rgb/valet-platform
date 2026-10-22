"use client";

import { useEffect, useRef, useState } from "react";
import {
  GuestBadge, GuestButton, GuestCard, GuestField, translate,
} from "./approved-elements";
import {
  CONTACT_FIELDS, validHttps, validPhone, type ContactDefaults,
  type ContactField, type GuestLanguage,
} from "./guest-information-model";

export function CompanyDefaultsCard({
  locale, companyName, defaults, onSave, announce, canEdit, onDirtyChange,
}: {
  readonly locale: GuestLanguage;
  readonly companyName: string;
  readonly defaults: ContactDefaults;
  readonly onSave: (defaults: ContactDefaults) => Promise<void>;
  readonly announce: (message: string, kind?: "error" | "info") => void;
  readonly canEdit: boolean;
  readonly onDirtyChange: (dirty: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [values, setValues] = useState<ContactDefaults>(defaults);
  const [saving, setSaving] = useState(false);
  const [invalid, setInvalid] = useState<ContactField | null>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const dirty = JSON.stringify(values) !== JSON.stringify(defaults);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  const count = CONTACT_FIELDS.filter((field) => Boolean(defaults[field])).length;
  async function save() {
    const wrong = values.hoursConfirmed && !values.hours?.trim() ? "hours" :
      CONTACT_FIELDS.find((field) => {
      const value = values[field] ?? "";
      return value.length > 240 ||
        (field === "phone" && !validPhone(value)) ||
        (field === "supportUrl" && !validHttps(value));
      });
    if (wrong) {
      setInvalid(wrong);
      announce(translate(locale, "Enter a valid contact value.",
        "أدخل قيمة تواصل صالحة."), "error");
      document.getElementById(`demo-company-${wrong}`)?.focus();
      return;
    }
    setSaving(true);
    try {
      await onSave(values);
    } finally {
      setSaving(false);
    }
  }
  function cancel() {
    setValues(defaults);
    setInvalid(null);
    setExpanded(false);
    toggle.current?.focus();
  }

  return (
    <GuestCard title={translate(locale, "Company Contact defaults", "معلومات التواصل الافتراضية للشركة")}
      subtitle={companyName}>
      <div className="v-compact-head">
        <div className="v-compact-status">
          <strong className="v-emphasis">
            {defaults.displayName || translate(locale, "Not set", "غير محدد")}
          </strong>
          <span className="v-small">
            {defaults.phone || translate(locale, "Not set", "غير محدد")} ·{" "}
            {count} / {CONTACT_FIELDS.length}{" "}
            {translate(locale, "fields set", "حقول مُعدّة")}
          </span>
          {dirty ? <GuestBadge kind="warn">
            {translate(locale, "Unsaved edits", "تعديلات غير محفوظة")}
          </GuestBadge> : null}
        </div>
        <button className={`v-btn ${expanded ? "v-btn-quiet" : "v-btn-secondary"}`}
          ref={toggle} type="button" aria-expanded={expanded}
          aria-controls={expanded ? "demo-company-editor" : undefined}
          disabled={!canEdit} onClick={() => {
            if (expanded && dirty) {
              announce(translate(locale, "Save or Cancel these edits before closing.",
                "احفظ التعديلات أو ألغِها قبل الإغلاق."));
              return;
            }
            setExpanded((value) => !value);
          }}>
          {expanded ? translate(locale, "Close editor", "إغلاق المحرر") :
            translate(locale, "Edit defaults", "تعديل الافتراضيات")}
        </button>
      </div>
      {expanded ? (
        <div className="v-editor" id="demo-company-editor" role="region"
          aria-label={translate(locale, "Edit company defaults", "تعديل افتراضيات الشركة")}>
          <div className="v-fields">
            {CONTACT_FIELDS.map((field) => (
              <GuestField key={field} field={field} locale={locale}
                value={values[field] ?? ""} prefix="company" invalid={invalid === field}
                onChange={(value) => {
                  setValues((previous) => ({ ...previous, [field]: value }));
                  setInvalid(null);
                }} />
            ))}
          </div>
          <label className="v-checkbox">
            <input type="checkbox" data-field="company.hoursVerified"
              checked={values.hoursConfirmed}
              onChange={(event) => setValues((previous) => ({
                ...previous, hoursConfirmed: event.target.checked,
              }))} />
            {translate(locale, "Support hours confirmed", "ساعات الدعم مؤكدة")}
          </label>
          <div className="v-editor-actions">
            <GuestButton kind="primary" disabled={saving} onClick={() => void save()}>
              {translate(locale, "Save company defaults", "حفظ افتراضيات الشركة")}
            </GuestButton>
            <GuestButton kind="quiet" onClick={cancel}>
              {translate(locale, "Cancel", "إلغاء")}
            </GuestButton>
          </div>
          {invalid ? <span className="v-small" role="alert">
            {translate(locale, "Invalid value", "قيمة غير صالحة")}
          </span> : null}
        </div>
      ) : null}
    </GuestCard>
  );
}
