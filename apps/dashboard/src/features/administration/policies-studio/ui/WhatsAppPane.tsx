import { useEffect, useState } from "react";
import { HelpCircle } from "lucide-react";
import { Button } from "../../../../components/presentation/button";
import { FocusDialog } from "../../../../components/presentation/focus-dialog";
import helpStyles from "../../../../features/help/context-help.module.css";
import { fields, type Field } from "./catalog";
import type { StudioWhatsAppData } from "./studio-types";
import { useStudio } from "./studio-context";
import { displayValue } from "./value-text";
import { ui } from "./copy";
import {
  whatsappRevisionChanged,
  whatsappRevisionMessage,
} from "./whatsapp-revision";

export function WhatsAppPane() {
  const { locale, route, adapter, setDirty, announce } = useStudio();
  const ar = locale === "ar";
  const copy = ui[locale];
  const isLocation = route.scope === "location";
  const waFields = fields.filter(
    (field) => field.section === "whatsapp",
  ) as Array<Field & { key: keyof StudioWhatsAppData["saved"] }>;
  const saved = adapter.whatsapp.saved;
  const [draft, setDraft] = useState(saved);
  const [editing, setEditing] = useState(false);
  const [editingRevision, setEditingRevision] = useState<number | null>(null);
  const [help, setHelp] = useState(false);
  const [error, setError] = useState("");
  const changed = JSON.stringify(draft) !== JSON.stringify(saved);
  const stale =
    editing &&
    whatsappRevisionChanged(editingRevision, adapter.whatsapp.revision);
  const visibleError = stale
    ? whatsappRevisionMessage(locale)
    : (adapter.whatsapp.error ?? error);
  useEffect(() => {
    setDirty(editing && changed);
  }, [editing, changed, setDirty]);
  async function save() {
    if (adapter.whatsapp.busy || !adapter.whatsapp.editable) return;
    if (stale) {
      setError(whatsappRevisionMessage(locale));
      return;
    }
    try {
      const result = await adapter.whatsapp.save(draft);
      if (!result.ok) {
        setError(result.message ?? copy.errorBody);
        return;
      }
      setDirty(false);
      setEditing(false);
      announce("");
    } catch {
      setError(copy.errorBody);
    }
  }
  const helpButton = (
    <button
      type="button"
      className={helpStyles.trigger}
      aria-label={
        ar ? "مساعدة: رابط الضيف عبر واتساب" : "Help: WhatsApp Guest Access"
      }
      onClick={() => setHelp(true)}
    >
      <HelpCircle size={16} aria-hidden="true" />
    </button>
  );
  return (
    <div className="ps-whatsapp">
      <div className="ps-message-note">
        <strong>
          {ar ? "الإرسال الحقيقي معطّل" : "Live sending is disabled"}
        </strong>
        <p>
          {ar
            ? "حفظ السياسة لا يربط ميتا ولا يرسل رسائل. موافقة المستلم والربط والقوالب والتحقق من الرابط شروط مستقلة. تظهر القوالب والأرقام المعتمدة المتاحة في القوائم أدناه."
            : "Saving a policy does not connect Meta or send messages. Recipient opt-in, onboarding, templates and link verification are separate gates. Available approved templates and verified senders appear below."}
        </p>
      </div>
      {editing ? (
        <form
          className="ps-editor"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <p className="ps-inline-note">
            {ar
              ? "مسودة السياسة. تظهر القيم المحفوظة الفعلية أدناه إلى أن تحفظ."
              : "Policy draft. Saved effective values remain visible below until Save."}
          </p>
          <div className="ps-zone-fields">
            <label>
              {waFields[0]!.labels[locale]}
              <select
                aria-label={waFields[0]!.labels[locale]}
                value={
                  draft.waEnabled === null ? "inherit" : String(draft.waEnabled)
                }
                onChange={(event) =>
                  setDraft((old) => ({
                    ...old,
                    waEnabled:
                      event.target.value === "inherit"
                        ? null
                        : event.target.value === "true",
                  }))
                }
              >
                {isLocation && (
                  <option value="inherit">{copy.inherited}</option>
                )}
                <option value="false">{ar ? "معطّل" : "Disabled"}</option>
                <option value="true">
                  {ar
                    ? "تفعيل السياسة (الإرسال الحقيقي يظل معطّلًا)"
                    : "Enable policy (live sending still disabled)"}
                </option>
              </select>
            </label>
            <label>
              {waFields[1]!.labels[locale]}
              <select
                aria-label={waFields[1]!.labels[locale]}
                value={
                  draft.waLanguage === null
                    ? "inherit"
                    : String(draft.waLanguage)
                }
                onChange={(event) =>
                  setDraft((old) => ({
                    ...old,
                    waLanguage:
                      event.target.value === "inherit"
                        ? null
                        : event.target.value,
                  }))
                }
              >
                {isLocation && (
                  <option value="inherit">{copy.inherited}</option>
                )}
                <option value="ar">{ar ? "العربية" : "Arabic"}</option>
                <option value="en">{ar ? "الإنجليزية" : "English"}</option>
              </select>
            </label>
            <label>
              {waFields[2]!.labels[locale]}
              <select
                aria-label={waFields[2]!.labels[locale]}
                value={String(draft.waTemplate ?? "")}
                onChange={(event) =>
                  setDraft((old) => ({
                    ...old,
                    waTemplate: event.target.value,
                  }))
                }
              >
                <option value="">
                  {ar ? "لم يتم اعتماد قالب" : "No approved template"}
                </option>
                {adapter.whatsapp.templates.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {waFields[3]!.labels[locale]}
              <select
                aria-label={waFields[3]!.labels[locale]}
                value={String(draft.waBinding ?? "")}
                onChange={(event) =>
                  setDraft((old) => ({ ...old, waBinding: event.target.value }))
                }
              >
                <option value="">
                  {ar ? "لم يربط رقم معتمد" : "No verified sender connection"}
                </option>
                {adapter.whatsapp.senders.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {visibleError && (
            <p role="alert" className="ps-error">
              {visibleError}
            </p>
          )}
          <div className="ps-actions">
            <Button
              type="submit"
              disabled={!changed || adapter.whatsapp.busy || stale}
            >
              {ar ? "حفظ إعدادات واتساب" : "Save WhatsApp settings"}
            </Button>
            {helpButton}
            <Button
              type="button"
              variant="quiet"
              onClick={() => {
                if (!changed || window.confirm(copy.leave)) {
                  setDirty(false);
                  setEditing(false);
                  setDraft(saved);
                }
              }}
            >
              {copy.cancel}
            </Button>
          </div>
        </form>
      ) : (
        <div className="ps-related">
          <Button
            variant="secondary"
            disabled={!adapter.whatsapp.editable || adapter.whatsapp.busy}
            onClick={() => {
              setEditing(true);
              setEditingRevision(adapter.whatsapp.revision);
              setDraft(saved);
              setError("");
            }}
          >
            {ar ? "تعديل إعدادات واتساب" : "Edit WhatsApp settings"}
          </Button>
          {helpButton}
        </div>
      )}
      {waFields.map((field) => {
        const inherited = isLocation && saved[field.key] === null;
        const effective = inherited
          ? adapter.whatsapp.defaults[field.key]
          : saved[field.key];
        return (
          <article
            key={field.key}
            className="ps-setting"
            data-setting={field.key}
          >
            <div className="ps-related">
              <h3>{field.labels[locale]}</h3>
              <div className="ps-setting-value">
                <strong>{displayValue(effective, field, locale)}</strong>
                <span className="ps-source">
                  {inherited
                    ? copy.inherited
                    : isLocation
                      ? copy.override
                      : copy.default}
                </span>
              </div>
            </div>
          </article>
        );
      })}
      {help && (
        <FocusDialog label={sectionTitle(ar)} onClose={() => setHelp(false)}>
          <div className="ps-dialog">
            <h2>{sectionTitle(ar)}</h2>
            <p>
              {ar
                ? "السياسة تسمح بالإرسال أو تعطّله، ويتيح الموقع وراثة قيمة الشركة. لغة الرسالة عربية أو إنجليزية. القوالب والأرقام تأتي فقط من قائمة القوالب المعتمدة والربط المتحقق. لا يمكن تعديل قالب حر أو إدخال بيانات اعتماد هنا."
                : "The policy permits or disables issuance; a location can inherit the company value. Message language is Arabic or English. Templates and sender numbers come only from the approved catalog and verified bindings. Arbitrary templates and credentials cannot be entered here."}
            </p>
            <p>
              {ar
                ? "تُحفظ الحقول كسياسة واحدة. التفعيل يتطلب قالبًا وربطًا صالحين؛ الحفظ لا يشغّل الإرسال ولا يثبت موافقة المستلم."
                : "Fields save as one policy. Enabling requires a valid template and binding; saving does not activate sending or prove recipient consent."}
            </p>
            <Button variant="secondary" onClick={() => setHelp(false)}>
              {ar ? "إغلاق" : "Close"}
            </Button>
          </div>
        </FocusDialog>
      )}
    </div>
  );
}
function sectionTitle(ar: boolean) {
  return ar ? "رابط الضيف عبر واتساب" : "WhatsApp Guest Access";
}
