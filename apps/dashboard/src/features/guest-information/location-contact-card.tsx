"use client";

import { useEffect, useRef, useState } from "react";
import {
  fieldLabels, GuestBadge, GuestButton, GuestCard, GuestField, translate,
} from "./approved-elements";
import {
  CONTACT_FIELDS, effectiveContact, validHttps, validPhone, type ContactDefaults,
  type ContactField, type GuestLanguage, type LocationContact,
} from "./guest-information-model";
import { useRevisionedDraft } from "./use-revisioned-draft";

export function LocationContactCard({
  locale, locationName, defaults, contact, onSave, announce, onDirtyChange,
  keepUnsavedOnConflict,
}: {
  readonly locale: GuestLanguage;
  readonly locationName: string;
  readonly defaults: ContactDefaults;
  readonly contact: LocationContact;
  readonly onSave: (contact: LocationContact) => Promise<void>;
  readonly announce: (message: string, kind?: "error" | "info") => void;
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly keepUnsavedOnConflict?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [field, setField] = useState<ContactField>("phone");
  const [fields, setFields] = useRevisionedDraft(
    contact.revision, contact.fields, keepUnsavedOnConflict);
  const [hoursConfirmed, setHoursConfirmed] = useRevisionedDraft(
    contact.revision, contact.hoursConfirmed, keepUnsavedOnConflict);
  const [saving, setSaving] = useState(false);
  const [invalid, setInvalid] = useState<ContactField | null>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const draft: LocationContact = { fields, hoursConfirmed, revision: contact.revision };
  const dirty = JSON.stringify(draft.fields) !== JSON.stringify(contact.fields) ||
    hoursConfirmed !== contact.hoursConfirmed;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  const current = fields[field];
  const chosen = effectiveContact(defaults, draft, field);
  const update = (next: LocationContact["fields"][ContactField]) => {
    setFields((prev) => ({ ...prev, [field]: next }));
    if (field === "hours" && next.mode !== "OVERRIDE") setHoursConfirmed(false);
  };

  async function save() {
    const wrong = CONTACT_FIELDS.find((name) => {
      const selected = fields[name];
      if (selected.mode !== "OVERRIDE") return false;
      const value = selected.value ?? "";
      return !value.trim() || value.length > 240 ||
        (name === "phone" && !validPhone(value)) ||
        (name === "supportUrl" && !validHttps(value));
    });
    if (wrong) {
      setField(wrong);
      setInvalid(wrong);
      announce(translate(locale, "Enter a valid value for the location override.",
        "أدخل قيمة صالحة لتجاوز الموقع."), "error");
      queueMicrotask(() => document.getElementById(`demo-override-${wrong}`)?.focus());
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  }
  function cancel() {
    setFields(contact.fields);
    setHoursConfirmed(contact.hoursConfirmed);
    setInvalid(null);
    setExpanded(false);
    toggle.current?.focus();
  }

  return (
    <GuestCard title={translate(locale, "Guest Contact", "تواصل الضيوف")}
      subtitle={locationName}>
      <div className="v-contact-summary">
        {CONTACT_FIELDS.map((name) => {
          // A summary is always based on persisted, guest-visible values.
          const effective = effectiveContact(defaults, contact, name);
          return (
            <div className="v-contact-row" key={name}>
              <span>{translate(locale, ...fieldLabels[name])}</span>
              <strong dir="auto">
                {effective.value || translate(locale, "Not set", "غير محدد")}
              </strong>
              <small>{effective.source === "Location"
                ? translate(locale, "Location", "الموقع")
                : translate(locale, "Company", "الشركة")}</small>
            </div>
          );
        })}
      </div>
      <div className="v-compact-footer">
        {dirty ? <GuestBadge kind="warn">
          {translate(locale, "Unsaved edits", "تعديلات غير محفوظة")}
        </GuestBadge> : null}
        <button type="button" ref={toggle}
          className={`v-btn ${expanded ? "v-btn-quiet" : "v-btn-secondary"}`}
          aria-expanded={expanded} aria-controls={expanded ? "demo-overrides-editor" : undefined}
          onClick={() => {
            if (expanded && dirty) {
              announce(translate(locale, "Save or Cancel these edits before closing.",
                "احفظ التعديلات أو ألغِها قبل الإغلاق."));
              return;
            }
            setExpanded((value) => !value);
          }}>
          {expanded
            ? translate(locale, "Close editor", "إغلاق المحرر")
            : translate(locale, "Customize", "تخصيص")}
        </button>
      </div>
      {expanded ? (
        <div className="v-editor" id="demo-overrides-editor" role="region"
          aria-label={translate(locale, "Customize one contact field", "تخصيص حقل تواصل واحد")}>
          <div className="v-field">
            <label htmlFor="demo-override-choice">
              {translate(locale, "Choose a field", "اختر الحقل")}
            </label>
            <select id="demo-override-choice" value={field}
              data-action="select-override-field"
              onChange={(event) => {
                setField(event.target.value as ContactField);
                setInvalid(null);
              }}>
              {CONTACT_FIELDS.map((name) => <option key={name} value={name}>
                {translate(locale, ...fieldLabels[name])}
              </option>)}
            </select>
          </div>
          <div className="v-divider" />
          <p className="v-small">
            {translate(locale,
              current.mode !== "INHERIT" ? "This location uses its own value." :
                "Currently using the company default.",
              current.mode !== "INHERIT" ? "يستخدم هذا الموقع قيمة خاصة به." :
                "يستخدم حالياً القيمة الافتراضية للشركة.")}
          </p>
          {current.mode === "INHERIT" ? (
            <>
              <strong className="v-emphasis">
                {chosen.value || translate(locale, "Not set", "غير محدد")}
              </strong>
              <GuestButton onClick={() => update({ mode: "OVERRIDE", value: "" })}>
                {translate(locale, "Set a location value", "تحديد قيمة للموقع")}
              </GuestButton>
            </>
          ) : (
            <>
              {current.mode === "UNAVAILABLE" ? (
                <>
                  <div className="v-note">
                    {translate(locale, "Hidden for this location", "مخفي في هذا الموقع")}
                  </div>
                  <GuestButton onClick={() => update({ mode: "OVERRIDE", value: "" })}>
                    {translate(locale, "Enter a value", "إدخال قيمة")}
                  </GuestButton>
                </>
              ) : (
                <GuestField field={field} locale={locale} value={current.value ?? ""}
                  prefix="override" invalid={invalid === field} onChange={(value) => {
                    update({ mode: "OVERRIDE", value });
                    setInvalid(null);
                  }} />
              )}
              {field === "hours" && current.mode === "OVERRIDE" ? (
                <label className="v-checkbox">
                  <input type="checkbox" data-field="override.hoursVerified"
                    checked={hoursConfirmed}
                    onChange={(event) => setHoursConfirmed(event.target.checked)} />
                  {translate(locale, "Hours confirmed", "الساعات مؤكدة")}
                </label>
              ) : null}
              <div className="v-editor-actions">
                <GuestButton onClick={() => update({ mode: "INHERIT", value: null })}>
                  {field === "phone"
                    ? translate(locale, "Use company number", "استخدام رقم الشركة")
                    : translate(locale, "Use company default", "استخدام افتراضي الشركة")}
                </GuestButton>
                {current.mode !== "UNAVAILABLE" ? (
                  <GuestButton kind="quiet" onClick={() =>
                    update({ mode: "UNAVAILABLE", value: null })}>
                    {translate(locale, "Mark unavailable", "غير متاح بالموقع")}
                  </GuestButton>
                ) : null}
              </div>
            </>
          )}
          <div className="v-editor-actions">
            <GuestButton kind="primary" disabled={saving} onClick={() => void save()}>
              {translate(locale, "Save location", "حفظ الموقع")}
            </GuestButton>
            <GuestButton kind="quiet" onClick={cancel}>
              {translate(locale, "Cancel", "إلغاء")}
            </GuestButton>
          </div>
        </div>
      ) : null}
      {invalid ? <span className="v-small" role="alert">
        {translate(locale, "Invalid value", "قيمة غير صالحة")}
      </span> : null}
    </GuestCard>
  );
}
