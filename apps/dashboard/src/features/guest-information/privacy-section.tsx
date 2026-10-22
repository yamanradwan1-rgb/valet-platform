"use client";

import { useEffect, useRef, useState } from "react";
import {
  GuestBadge, GuestButton, GuestCard, guestPrivacyFieldId, translate,
} from "./approved-elements";
import {
  policyStatus, validHttps, type GuestLanguage, type LocationPrivacy,
  type PolicyContent,
} from "./guest-information-model";
import { useRevisionedDraft } from "./use-revisioned-draft";

type Drafts = Record<GuestLanguage, PolicyContent>;
type PrivacyOperation = "save" | "publish" | "unpublish";

export function PrivacySection({
  locale, locationName, privacy, onLocaleChange, onOperation, announce, active,
  onDirtyChange, keepUnsavedOnConflict,
}: {
  readonly locale: GuestLanguage;
  readonly active: boolean;
  readonly locationName: string;
  readonly privacy: LocationPrivacy;
  readonly onLocaleChange: (locale: GuestLanguage) => void;
  readonly onOperation: (operation: PrivacyOperation, drafts: Drafts) => Promise<void>;
  readonly announce: (message: string, kind?: "error" | "info") => void;
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly keepUnsavedOnConflict?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [drafts, setDrafts] = useRevisionedDraft<Drafts>(
    privacy.revision, privacy.drafts, keepUnsavedOnConflict);
  const [saving, setSaving] = useState(false);
  const [invalid, setInvalid] = useState<"text" | "url" | null>(null);
  const firstField = useRef<HTMLTextAreaElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const draft = drafts[locale];
  const dirty = JSON.stringify(drafts) !== JSON.stringify(privacy.drafts);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  const status = policyStatus(privacy, locale);
  const canPublish = !dirty && Object.values(drafts).some((part) =>
    part.text.trim() || part.url.trim()) &&
    JSON.stringify(drafts) !== JSON.stringify(privacy.published);

  function update(field: keyof PolicyContent, value: string) {
    setDrafts((current) => ({
      ...current, [locale]: { ...current[locale], [field]: value },
    }));
    setInvalid(null);
  }

  async function execute(operation: PrivacyOperation) {
    if (operation === "save") {
      if (draft.text.length > 5000 || !validHttps(draft.url)) {
        const field = draft.text.length > 5000 ? "text" : "url";
        setInvalid(field);
        announce(translate(locale,
          field === "text" ? "Policy text exceeds 5,000 characters." :
            "Policy link must use a valid HTTPS URL.",
          field === "text" ? "النص يتجاوز ٥٠٠٠ حرف." :
            "رابط السياسة يجب أن يكون HTTPS صالحاً."), "error");
        document.getElementById(guestPrivacyFieldId(field))?.focus();
        return;
      }
    }
    setSaving(true);
    try {
      await onOperation(operation, drafts);
      if (operation !== "save") toggleRef.current?.focus();
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setDrafts({ en: { ...privacy.drafts.en }, ar: { ...privacy.drafts.ar } });
    setExpanded(false);
    setInvalid(null);
    toggleRef.current?.focus();
  }

  return (
    <section className="opt2-view" id="opt2-privacy" data-view="privacy"
      aria-label={translate(locale, "Privacy & Terms", "الخصوصية والشروط")}
      tabIndex={-1} hidden={!active} aria-hidden={!active}>
      <div className="opt2-widgets">
        <div data-widget="privacy">
          <GuestCard title={translate(locale, "Privacy & Terms", "الخصوصية والشروط")}
            subtitle={locationName}>
            <div className="v-compact-head">
              <div className="v-compact-status">
                <GuestBadge kind={status === "PUBLISHED" ? "good" : "warn"}>
                  {status === "PUBLISHED"
                    ? translate(locale, "Published · Active", "منشور · نشط")
                    : status === "UNAVAILABLE"
                      ? translate(locale, "Not available in English", "غير متاح بالعربية")
                      : translate(locale, "Unpublished", "غير منشور")}
                </GuestBadge>
                {dirty ? <GuestBadge kind="warn">
                  {translate(locale, "Unsaved edits", "تعديلات غير محفوظة")}
                </GuestBadge> : null}
                <span className="v-small">
                  {translate(locale, "Applies only to this location", "خاصة بهذا الموقع فقط")}
                </span>
              </div>
              <button type="button" ref={toggleRef}
                className={`v-btn ${expanded ? "v-btn-quiet" : "v-btn-secondary"}`}
                aria-expanded={expanded}
                aria-controls={expanded ? "guest-information-privacy-editor" : undefined}
                onClick={() => {
                  if (expanded && dirty) {
                    announce(translate(locale, "Save or Cancel these edits before closing.",
                      "احفظ التعديلات أو ألغِها قبل الإغلاق."));
                    return;
                  }
                  setExpanded(!expanded);
                  if (!expanded) queueMicrotask(() => firstField.current?.focus());
                }}>
                {expanded
                  ? translate(locale, "Close editor", "إغلاق المحرر")
                  : translate(locale, "Edit privacy", "تعديل الخصوصية")}
              </button>
            </div>
            {expanded ? (
              <div className="v-editor" id="guest-information-privacy-editor" role="region"
                aria-label={translate(locale, "Edit location privacy", "تعديل خصوصية الموقع")}>
                <p className="v-small">{translate(locale,
                  "Enter the company-approved text, then save a draft. Publish separately.",
                  "أدخل النص المعتمد من الشركة، ثم احفظ المسودة. النشر خطوة منفصلة.")}</p>
                <div className="v-row v-wrap">
                  {(["en", "ar"] as const).map((language) => (
                    <GuestButton key={language} onClick={() => onLocaleChange(language)}
                      kind={locale === language ? "active" : "secondary"}
                      aria-pressed={locale === language}>
                      {language === "en" ? "English " : "العربية "}
                      {drafts[language].text || drafts[language].url ? "✓" : "—"}
                    </GuestButton>
                  ))}
                </div>
                <div className="v-field">
                  <label htmlFor={guestPrivacyFieldId("text")}>
                    {translate(locale, "Privacy text", "نص الخصوصية")}
                  </label>
                  <textarea ref={firstField} id={guestPrivacyFieldId("text")} rows={5}
                    maxLength={5001} data-field="privacy.text" value={draft.text}
                    aria-invalid={invalid === "text"}
                    onChange={(event) => update("text", event.target.value)} />
                </div>
                <div className="v-field">
                  <label htmlFor={guestPrivacyFieldId("url")}>
                    {translate(locale, "Approved HTTPS link (optional)", "رابط HTTPS معتمد (اختياري)")}
                  </label>
                  <input type="url" id={guestPrivacyFieldId("url")} data-field="privacy.url"
                    value={draft.url} autoComplete="off"
                    aria-invalid={invalid === "url"}
                    placeholder="https://"
                    onChange={(event) => update("url", event.target.value)} />
                </div>
                <div className="v-editor-actions">
                  <GuestButton kind="primary" disabled={saving}
                    onClick={() => void execute("save")}>
                    {translate(locale, "Save draft", "حفظ المسودة")}
                  </GuestButton>
                  {canPublish ? <GuestButton disabled={saving}
                    onClick={() => void execute("publish")}>
                    {translate(locale, "Publish policy", "نشر السياسة")}
                  </GuestButton> : null}
                  {privacy.published ? <GuestButton kind="quiet" disabled={saving}
                    onClick={() => void execute("unpublish")}>
                    {translate(locale, "Unpublish", "إلغاء النشر")}
                  </GuestButton> : null}
                  <GuestButton kind="quiet" onClick={cancel}>
                    {translate(locale, "Cancel", "إلغاء")}
                  </GuestButton>
                </div>
                <span className="v-small">
                  {translate(locale, "Version", "الإصدار")}: {privacy.version} ·{" "}
                  {translate(locale, "Updated", "آخر تحديث")}: {privacy.updatedAt ?? "—"}
                </span>
              </div>
            ) : null}
          </GuestCard>
        </div>
      </div>
    </section>
  );
}
