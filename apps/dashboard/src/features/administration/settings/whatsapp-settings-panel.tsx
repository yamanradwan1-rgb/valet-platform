"use client";

import { useEffect, useState } from "react";
import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import type { DashboardLocale } from "../../../lib/i18n/locale";
import {
  readWhatsAppSettings, saveWhatsAppSettings,
  type WhatsAppPolicyView, type WhatsAppSettingsView,
} from "./whatsapp-settings-api";
import css from "./whatsapp-settings.module.css";

export function WhatsAppSettingsPanel(props: {
  readonly api: DashboardApiClient;
  readonly organizationId: string;
  readonly locationId: string | null;
  readonly locale: DashboardLocale;
}) {
  const [view, setView] = useState<WhatsAppSettingsView | null>(null);
  const [draft, setDraft] = useState<WhatsAppPolicyView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ar = props.locale === "ar";
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    void readWhatsAppSettings(props.api, props.organizationId, props.locationId, controller.signal)
      .then((value) => {
        if (!current || value.organizationId !== props.organizationId ||
            value.locationId !== props.locationId) return;
        setView(value);
        setDraft(value.policy);
      })
      .catch(() => { if (current && !controller.signal.aborted) setError(ar
        ? "تعذّر تحميل إعدادات واتساب." : "Could not load WhatsApp settings."); });
    return () => { current = false; controller.abort(); };
  }, [props.api, props.organizationId, props.locationId, ar]);

  async function save() {
    if (!draft || busy) return;
    setBusy(true);
    setError("");
    try {
      const latest = await saveWhatsAppSettings(
        props.api, props.organizationId, props.locationId, draft,
      );
      if (latest.organizationId !== props.organizationId ||
          latest.locationId !== props.locationId) throw new Error("SCOPE_MISMATCH");
      setView(latest);
      setDraft(latest.policy);
    } catch {
      setError(ar ? "لم يُحفظ التغيير. أعد تحميل الإعدادات وتحقق من الصلاحيات."
        : "Change not saved. Reload settings and verify access.");
    } finally {
      setBusy(false);
    }
  }

  const update = (patch: Partial<WhatsAppPolicyView>) => {
    setDraft((old) => old ? { ...old, ...patch } : old);
  };

  return (
    <section aria-label={ar ? "إعدادات واتساب" : "WhatsApp guest access"} className={css.panel}>
      <h3>{ar ? "إرسال رابط الضيف عبر واتساب" : "WhatsApp Guest Access"}</h3>
      <p className={css.note}>
        {ar ? "الإرسال الحقيقي معطّل إلى حين التحقق من موافقة المستلم وربط ميتا والقوالب والرابط."
          : "Live sending remains disabled pending recipient opt-in, Meta account, templates and link verification."}
      </p>
      {error ? <p role="alert" className={css.error}>{error}</p> : null}
      {!draft || !view ? <p aria-live="polite">{ar ? "جارٍ تحميل الإعدادات…" : "Loading settings…"}</p> : (
        <div className={css.fields}>
          <label>
            {ar ? "إعداد إرسال الشركة/الموقع" : "Company / Location sending policy"}
            <select disabled={busy} value={draft.enabled === null
              ? props.locationId ? "inherit" : "false" : String(draft.enabled)}
              onChange={(e) => update({ enabled: e.target.value === "inherit"
                ? null : e.target.value === "true" })}>
              {props.locationId ? <option value="inherit">{ar ? "استخدام إعداد الشركة" : "Inherit company default"}</option> : null}
              <option value="false">{ar ? "معطّل" : "Disabled"}</option>
              <option value="true">{ar ? "تفعيل السياسة (الإرسال الحقيقي لا يزال معطلاً)" : "Enable policy (live sending still disabled)"}</option>
            </select>
          </label>
          <label>
            {ar ? "لغة الرسالة" : "Message language"}
            <select disabled={busy} value={draft.language ?? (props.locationId ? "inherit" : "ar")} onChange={(e) =>
              update({ language: e.target.value === "inherit"
                ? null : e.target.value as "ar" | "en" })}>
              {props.locationId ? <option value="inherit">{ar ? "إعداد الشركة" : "Company default"}</option> : null}
              <option value="ar">{ar ? "العربية" : "Arabic"}</option>
              <option value="en">{ar ? "الإنجليزية" : "English"}</option>
            </select>
          </label>
          <label>
            {ar ? "نسخة القالب المعتمدة" : "Approved template version"}
            <select disabled={busy} value={draft.templateCatalogVersion ?? ""} onChange={(e) =>
              update({ templateCatalogVersion: e.target.value || null })}>
              <option value="">{ar ? "لم يتم اعتماد قالب" : "No approved template"}</option>
              {view.approvedTemplateVersions.map((version) =>
                <option key={version} value={version}>{version}</option>)}
            </select>
          </label>
          <label>
            {ar ? "رقم واتساب الخاص بالشركة" : "Company WhatsApp sending number"}
            <select disabled={busy} value={draft.providerBindingId ?? ""} onChange={(e) =>
              update({ providerBindingId: e.target.value || null })}>
              <option value="">{ar ? "لم يربط رقم معتمد" : "No verified sender connection"}</option>
              {view.connections.map((connection) => <option key={connection.id} value={connection.id}>
                {connection.phoneNumberId} — {connection.status === "VERIFIED"
                  ? (ar ? "تم التحقق" : "Verified")
                  : (ar ? "بانتظار التحقق من ميتا" : "Meta verification pending")}
              </option>)}
            </select>
          </label>
          <p className={css.note}>
            {ar ? "الحالة: الربط والإرسال يحتاجان تهيئة معتمدة من ميتا."
              : "Connection status: Meta onboarding and verification are still required."}
          </p>
          <button className={css.save} disabled={busy} onClick={() => void save()} type="button">
            {busy ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "حفظ إعدادات واتساب" : "Save WhatsApp settings")}
          </button>
        </div>
      )}
    </section>
  );
}
