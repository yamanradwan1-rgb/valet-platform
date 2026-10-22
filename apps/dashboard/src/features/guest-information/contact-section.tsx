import type { GuestInformationResponse } from "@valet/contracts";
import type {
  ContactDefaults, GuestLanguage, LocationContact,
} from "./guest-information-model";
import { translate } from "./approved-elements";
import { CompanyDefaultsCard } from "./company-defaults-card";
import { GuestPreviewCard } from "./guest-preview-card";
import { LocationContactCard } from "./location-contact-card";

export function ContactSection({
  locale, locationName, companyName, defaults, contact, preview, canEditCompany,
  active,
  onSaveCompany, onSaveLocation, announce, onCompanyDirty, onLocationDirty,
}: {
  readonly locale: GuestLanguage;
  readonly active: boolean;
  readonly locationName: string;
  readonly companyName: string;
  readonly defaults: ContactDefaults;
  readonly contact: LocationContact;
  readonly preview: GuestInformationResponse | null;
  readonly canEditCompany: boolean;
  readonly onSaveCompany: (defaults: ContactDefaults) => Promise<void>;
  readonly onSaveLocation: (contact: LocationContact) => Promise<void>;
  readonly announce: (message: string, kind?: "error" | "info") => void;
  readonly onCompanyDirty: (dirty: boolean) => void;
  readonly onLocationDirty: (dirty: boolean) => void;
}) {
  return (
    <section className="opt2-view" id="opt2-contact" data-view="contact"
      aria-label={translate(locale, "Guest contact", "تواصل الضيف")}
      tabIndex={-1} hidden={!active} aria-hidden={!active}>
      <div className="opt2-widgets">
        <div data-widget="overrides">
          <LocationContactCard locale={locale} locationName={locationName}
            defaults={defaults} contact={contact} onSave={onSaveLocation}
            announce={announce} onDirtyChange={onLocationDirty} />
        </div>
        <details className="opt2-more">
          <summary>{translate(locale, "Company contact defaults", "بيانات التواصل الافتراضية للشركة")}</summary>
          <div data-widget="company">
            <CompanyDefaultsCard locale={locale} companyName={companyName}
              defaults={defaults} onSave={onSaveCompany} announce={announce}
              canEdit={canEditCompany} onDirtyChange={onCompanyDirty} />
          </div>
        </details>
        <details className="opt2-more" data-guest-preview>
          <summary>{translate(locale, "Guest preview", "معاينة الضيف")}</summary>
          <div data-widget="preview">
            {preview ? (
              <GuestPreviewCard locale={locale} defaults={defaults}
                contact={contact} preview={preview} />
            ) : <div className="v-empty" role="status">
              {translate(locale, "Loading…", "جارٍ التحميل…")}
            </div>}
          </div>
        </details>
      </div>
    </section>
  );
}
