import { useEffect, useId, useRef, useState } from "react";
import { fixtureNotice, sampleWhatsApp } from "../fixtures/simulated-data";
import type { PrototypeLocale } from "../types/variant";
import "./whatsapp-full.css";

type Scope = "company" | "location";
type Language = "ar" | "en";
type Policy = {
  enabled: boolean | null;
  language: Language | null;
  templateCatalogVersion: string | null;
  providerBindingId: string | null;
  revision: number;
};
export type WhatsAppPrototypeSnapshot = Readonly<{ saved: Policy; serverRevision: number }>;
type PolicyField = "enabled" | "language" | "templateCatalogVersion" | "providerBindingId";
type Feedback = "saved" | "conflict" | "invalid" | "external" | "reloaded" | null;

interface Props {
  readonly locale: PrototypeLocale;
  readonly scope: Scope;
  readonly onDirtyChange?: (dirty: boolean) => void;
  readonly snapshot?: WhatsAppPrototypeSnapshot;
  readonly companySaved?: Policy;
  readonly onSnapshotChange?: (snapshot: WhatsAppPrototypeSnapshot) => void;
}

/**
 * Prototype of the current Company Admin policy panel embedded in the
 * Company Defaults / selected Location Overrides tabs (settings-page.tsx).
 * Typed policy, inherited null values and expectedRevision follow
 * whatsapp-settings-api.ts and whatsapp-settings-service.ts; available sender
 * bindings/templates must come from the server. DEC-087/105 prohibit assuming
 * an enabled policy means real delivery is ready. No API calls are made here.
 */
function initialPolicy(scope: Scope): Policy {
  const source = scope === "company" ? sampleWhatsApp.policy : sampleWhatsApp.locationOverride;
  return { ...source, revision: 0 };
}

function differs(a: Policy, b: Policy): boolean {
  return a.enabled !== b.enabled || a.language !== b.language ||
    a.templateCatalogVersion !== b.templateCatalogVersion ||
    a.providerBindingId !== b.providerBindingId;
}

export function WhatsAppFull({ locale, scope, onDirtyChange, snapshot, companySaved, onSnapshotChange }: Props) {
  const ids = useId();
  const dirtyCallback = useRef(onDirtyChange);
  dirtyCallback.current = onDirtyChange;
  const ar = locale === "ar";
  const location = scope === "location";
  const [saved, setSaved] = useState<Policy>(() => snapshot?.saved ?? initialPolicy(scope));
  const [draft, setDraft] = useState<Policy>(() => snapshot?.saved ?? initialPolicy(scope));
  const [serverRevision, setServerRevision] = useState(() => snapshot?.serverRevision ?? 0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const dirty = differs(draft, saved);
  const remoteConflict = serverRevision !== saved.revision;
  const effective = {
    enabled: draft.enabled ?? (companySaved ?? sampleWhatsApp.policy).enabled,
    language: draft.language ?? (companySaved ?? sampleWhatsApp.policy).language,
    templateCatalogVersion: draft.templateCatalogVersion ??
      (companySaved ?? sampleWhatsApp.policy).templateCatalogVersion,
    providerBindingId: draft.providerBindingId ?? (companySaved ?? sampleWhatsApp.policy).providerBindingId,
  };
  const missingPrerequisites = effective.enabled === true &&
    (!effective.language || !effective.templateCatalogVersion || !effective.providerBindingId);

  useEffect(() => {
    const next = snapshot?.saved ?? initialPolicy(scope);
    setSaved(next);
    setDraft(next);
    setServerRevision(snapshot?.serverRevision ?? 0);
    setFeedback(null);
  }, [scope]);

  useEffect(() => {
    dirtyCallback.current?.(dirty);
  }, [dirty, scope]);

  function change<K extends PolicyField>(key: K, value: Policy[K]) {
    setDraft(previous => ({ ...previous, [key]: value }));
    setFeedback(null);
  }

  function save() {
    if (!dirty) return;
    if (remoteConflict) {
      setFeedback("conflict");
      return;
    }
    if (missingPrerequisites) {
      setFeedback("invalid");
      return;
    }
    const next = { ...draft, revision: serverRevision + 1 };
    setServerRevision(next.revision);
    setSaved(next);
    setDraft(next);
    onSnapshotChange?.({ saved: next, serverRevision: next.revision });
    setFeedback("saved");
  }

  function reload() {
    // The simulated remote writer changes the revision only; no remote field
    // values are invented. A reload intentionally discards this local draft.
    const next = { ...saved, revision: serverRevision };
    setSaved(next);
    setDraft(next);
    onSnapshotChange?.({ saved: next, serverRevision });
    setFeedback("reloaded");
  }

  const feedbackCopy = {
    saved: ar ? "حُفظت السياسة داخل الذاكرة التجريبية فقط؛ لم يتغير أي إعداد فعلي." :
      "Policy saved in prototype memory only. No real setting was changed.",
    conflict: ar ? "تعارض إصدار (409): تغيّر الإصدار قبل الحفظ. أعد تحميل النسخة الأحدث ثم راجع التعديلات." :
      "Revision conflict (409): the version changed before Save. Reload the latest revision and review your changes.",
    invalid: ar ? "تعذّر حفظ التفعيل: يجب اختيار لغة وقالب معتمد ورقم إرسال موثّق أولًا." :
      "Cannot save enabled policy: language, approved template and verified sender are required.",
    external: ar ? "محاكاة: زاد إصدار الخادم بواسطة مدير آخر. أي حفظ للمسودة القديمة سيواجه تعارضًا." :
      "Simulation: another administrator advanced the server revision. Saving a stale draft will conflict.",
    reloaded: ar ? "تمت محاكاة إعادة التحميل والتخلي عن التعديلات غير المحفوظة." :
      "Simulated reload completed and unsaved edits were discarded.",
  };

  return <section className="p321-wa" aria-labelledby={ids + "-heading"}>
    <header className="p321-wa-header">
      <div>
        <div className="p321-wa-kicker">{ar ? "سياسات التواصل مع الضيوف" : "Guest communication policy"}</div>
        <h3 id={ids + "-heading"}>{ar ? "وصول الضيف عبر واتساب" : "WhatsApp Guest Access"}</h3>
        <p>{ar
          ? "إعدادات إرسال رابط وصول الضيف الأولي، ضمن إعدادات الشركة أو استثناء الموقع."
          : "Initial guest access link settings under Company defaults or a Location override."}</p>
      </div>
      <span className="p321-wa-scope">{location
        ? (ar ? "استثناء الموقع" : "Location override")
        : (ar ? "إعداد الشركة" : "Company default")}</span>
    </header>

    <p className="p321-wa-prototype" role="note">{fixtureNotice[locale]}</p>
    <div className="p321-wa-gate" role="status">
      <span className="p321-wa-gate-dot" aria-hidden="true" />
      <div>
        <strong>{ar ? "الإرسال الفعلي غير مفعّل" : "Live sending is not activated"}</strong>
        <p>{ar
          ? "يستلزم التشغيل موافقة المستلم، وربط Meta معتمدًا، وقوالب موافَقًا عليها، والتحقق الأمني من الرابط."
          : "Activation requires recipient opt-in, approved Meta onboarding and templates, plus secure-link verification."}</p>
      </div>
    </div>

    <div className="p321-wa-stats" aria-label={ar ? "حالة واتساب التجريبية" : "Simulated WhatsApp status"}>
      <div><span>{ar ? "مفتاح الإرسال العام" : "Global send switch"}</span>
        <strong>{ar ? "معطّل" : "Off"}</strong></div>
      <div><span>{ar ? "جاهزية التفعيل" : "Activation readiness"}</span>
        <strong>{ar ? "غير جاهز" : "Not ready"}</strong></div>
      <div><span>{ar ? "رقم إصدار السياسة" : "Policy revision"}</span>
        <strong className="p321-wa-number">{saved.revision}{remoteConflict ? " → " + serverRevision : ""}</strong></div>
    </div>

    <div className="p321-wa-fields">
      <div className="p321-wa-field">
        <label htmlFor={ids + "-enabled"}>{ar ? "سياسة الإرسال" : "Sending policy"}</label>
        <p>{ar ? "السماح بالسياسة لا يتجاوز حواجز التفعيل العامة." :
          "Allowing this policy does not override the global activation gates."}</p>
        <select id={ids + "-enabled"} value={draft.enabled === null ? "inherit" : String(draft.enabled)}
          onChange={event => change("enabled", event.target.value === "inherit" ? null : event.target.value === "true")}>
          {location && <option value="inherit">{ar ? "وراثة إعداد الشركة" : "Inherit company"}</option>}
          <option value="false">{ar ? "معطّل" : "Disabled"}</option>
          <option value="true">{ar ? "تفعيل السياسة فقط (لا إرسال فعلي)" : "Enable policy only (no live sending)"}</option>
        </select>
        {location && <small>{ar ? "الفعلي: " : "Effective: "}
          {effective.enabled ? (ar ? "مفعّل" : "Enabled") : (ar ? "معطّل" : "Disabled")}</small>}
      </div>

      <div className="p321-wa-field">
        <label htmlFor={ids + "-language"}>{ar ? "لغة الرسالة" : "Message language"}</label>
        <p>{ar ? "لغة القالب المطلوب في سياسة الشركة أو الموقع." :
          "Language of the selected Company or Location message template."}</p>
        <select id={ids + "-language"} value={draft.language ?? "inherit"}
          onChange={event => change("language", event.target.value === "inherit" ? null : event.target.value as Language)}>
          {location && <option value="inherit">{ar ? "وراثة الشركة" : "Inherit company"}</option>}
          <option value="ar">{ar ? "العربية" : "Arabic"}</option>
          <option value="en">{ar ? "الإنجليزية" : "English"}</option>
        </select>
        {location && <small>{ar ? "الفعلي: " : "Effective: "}
          {effective.language === "ar" ? (ar ? "العربية" : "Arabic") : "English"}</small>}
      </div>

      <div className="p321-wa-field">
        <label htmlFor={ids + "-template"}>{ar ? "نسخة القالب المعتمدة" : "Approved template version"}</label>
        <p>{ar ? "تعرض القائمة النسخ المعتمدة فقط. لا توجد نسخ متاحة في هذا المثال." :
          "Only server-approved versions may appear here. The sample catalog is empty."}</p>
        <select id={ids + "-template"} value={draft.templateCatalogVersion ?? ""}
          onChange={event => change("templateCatalogVersion", event.target.value || null)}
          disabled={sampleWhatsApp.approvedTemplateVersions.length === 0}>
          <option value="">{location
            ? (ar ? "وراثة الشركة — لا قالب مهيأ" : "Inherit company — no template configured")
            : (ar ? "لا توجد قوالب معتمدة" : "No approved templates")}</option>
          {sampleWhatsApp.approvedTemplateVersions.map(version =>
            <option key={version} value={version}>{version}</option>)}
        </select>
        <small>{ar ? "لا يمكن إضافة نسخة قالب يدويًا في هذه الواجهة." :
          "Template versions cannot be created from this screen."}</small>
      </div>

      <div className="p321-wa-field">
        <label htmlFor={ids + "-sender"}>{ar ? "رقم واتساب الخاص بالشركة" : "Company WhatsApp sending number"}</label>
        <p>{ar ? "تُعرض روابط أرقام الشركة المخوّلة والمتحقق منها بواسطة الخادم فقط." :
          "Only authorized Company sender connections returned by the server are selectable."}</p>
        <select id={ids + "-sender"} value={draft.providerBindingId ?? ""}
          onChange={event => change("providerBindingId", event.target.value || null)}
          disabled={sampleWhatsApp.connections.length === 0}>
          <option value="">{location
            ? (ar ? "وراثة الشركة — لا رقم متصل" : "Inherit company — no sender connected")
            : (ar ? "لا يوجد رقم إرسال موثّق" : "No verified sender connection")}</option>
        </select>
        <small>{ar ? "ربط Meta والتحقق منه ليسا متاحين داخل هذا النموذج." :
          "Meta onboarding and verification are unavailable in this prototype."}</small>
      </div>
    </div>

    {missingPrerequisites && <p className="p321-wa-error" role="alert">{ar
      ? "السياسة المفعّلة تحتاج لغة وقالبًا معتمدًا ورقم إرسال موثّق؛ الإرسال الفعلي سيظل معطّلًا."
      : "An enabled policy requires a language, approved template and verified sender. Live sending remains off."}</p>}
    {feedback && <p className={feedback === "conflict" || feedback === "invalid"
      ? "p321-wa-error" : "p321-wa-info"} role="status" aria-live="polite">{feedbackCopy[feedback]}</p>}

    <footer className="p321-wa-footer">
      <div className="p321-wa-actions">
        <button type="button" className="p321-save" disabled={!dirty} onClick={save}>
          {ar ? "حفظ إعدادات واتساب (محاكاة)" : "Save WhatsApp settings (simulated)"}
        </button>
        <button type="button" className="p321-outline" disabled={!dirty && !remoteConflict}
          onClick={reload}>{ar ? "إعادة تحميل النسخة" : "Reload latest revision"}</button>
      </div>
      <button type="button" className="p321-wa-simulate"
        onClick={() => { const next = serverRevision + 1; setServerRevision(next); onSnapshotChange?.({ saved, serverRevision: next }); setFeedback("external"); }}>
        {ar ? "محاكاة تغيير متزامن (409)" : "Simulate concurrent revision (409)"}
      </button>
    </footer>
  </section>;
}
