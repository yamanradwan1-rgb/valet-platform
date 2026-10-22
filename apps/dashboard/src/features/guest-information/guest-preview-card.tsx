import type { GuestInformationResponse } from "@valet/contracts";
import { fieldLabels, GuestBadge, GuestCard, translate } from "./approved-elements";
import {
  CONTACT_FIELDS, effectiveContact, type ContactDefaults,
  type GuestLanguage, type LocationContact,
} from "./guest-information-model";

export function GuestPreviewCard({
  locale, defaults, contact, preview,
}: {
  readonly locale: GuestLanguage;
  readonly defaults: ContactDefaults;
  readonly contact: LocationContact;
  readonly preview: GuestInformationResponse;
}) {
  const published = preview.privacy.status === "PUBLISHED" ? preview.privacy : null;
  return (
    <GuestCard
      title={translate(locale, "Guest-visible preview", "معاينة ما يراه الضيف")}
      subtitle={translate(locale,
        "Resolved for the selected Location and language",
        "محسوبة للموقع واللغة المحددين")}
      extra={<GuestBadge kind="neutral">
        {translate(locale, "Saved · Current", "محفوظ · حالي")}
      </GuestBadge>}>
      <div className="v-compact-head">
        <p className="v-small">{translate(locale,
          "Only saved contact information and published privacy appear to guests.",
          "يظهر للضيوف التواصل المحفوظ وسياسة الخصوصية المنشورة فقط.")}</p>
      </div>
      <div className="v-editor" id="demo-preview-editor" role="region"
        aria-label={translate(locale, "Guest-visible information", "المعلومات الظاهرة للضيف")}>
        <div className="v-preview-columns">
          <div>
            <h3>{translate(locale, "Guest Privacy & Terms", "الخصوصية والشروط للضيف")}</h3>
            {published ? (
              <>
                <div className="v-published-text" dir="auto">
                  {published.text || translate(locale, "View approved HTTPS policy link:",
                    "عرض رابط السياسة المعتمدة:")}
                </div>
                {published.url ? <div className="v-small v-break">
                  {published.url}
                </div> : null}
              </>
            ) : <div className="v-empty">
              {translate(locale, "No published policy available in this language.",
                "لا توجد سياسة منشورة متاحة بهذه اللغة.")}
            </div>}
          </div>
          <div>
            <h3>{translate(locale, "Guest Contact", "التواصل للضيف")}</h3>
            {CONTACT_FIELDS.map((field) => {
              const resolved = effectiveContact(defaults, contact, field);
              return (
                <div className="v-preview-row" key={field}>
                  <span>{translate(locale, ...fieldLabels[field])}</span>
                  <strong dir="auto">{preview.contact[field] ||
                    translate(locale, "Not available", "غير متاح")}</strong>
                  <small>{resolved.source === "Location"
                    ? translate(locale, "Location", "الموقع")
                    : translate(locale, "Company", "الشركة")}</small>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </GuestCard>
  );
}
