import type { GuestInformationResponse } from "@valet/contracts";
import { DashboardApiError } from "../../lib/api/dashboard-api-error";
import type {
  ContactDefaults, GuestLanguage, LocationContact,
} from "./guest-information-model";
import { translate } from "./approved-elements";
import { CompanyDefaultsCard } from "./company-defaults-card";
import { GuestPreviewCard } from "./guest-preview-card";
import { LocationContactCard } from "./location-contact-card";

interface PreviewRead {
  readonly data: GuestInformationResponse | null;
  readonly error: Error | null;
  readonly loading: boolean;
  readonly refresh: () => void;
}

export function ContactSection({
  locale, locationName, companyName, defaults, contact, preview, canEditCompany,
  active,
  onSaveCompany, onSaveLocation, announce, onCompanyDirty, onLocationDirty,
  keepUnsavedOnConflict = false,
}: {
  readonly locale: GuestLanguage;
  readonly active: boolean;
  readonly locationName: string;
  readonly companyName: string;
  readonly defaults: ContactDefaults;
  readonly contact: LocationContact;
  readonly preview: PreviewRead;
  readonly canEditCompany: boolean;
  readonly onSaveCompany: (defaults: ContactDefaults) => Promise<void>;
  readonly onSaveLocation: (contact: LocationContact) => Promise<void>;
  readonly announce: (message: string, kind?: "error" | "info") => void;
  readonly onCompanyDirty: (dirty: boolean) => void;
  readonly onLocationDirty: (dirty: boolean) => void;
  readonly keepUnsavedOnConflict?: boolean;
}) {
  const accessError = preview.error instanceof DashboardApiError &&
    (preview.error.kind === "auth" || preview.error.kind === "authorization" ||
      preview.error.kind === "mfa" || preview.error.kind === "entitlement");
  return (
    <section className="opt2-view" id="opt2-contact" data-view="contact"
      aria-label={translate(locale, "Guest contact", "تواصل الضيف")}
      tabIndex={-1} hidden={!active} aria-hidden={!active}>
      <div className="opt2-widgets">
        <div data-widget="overrides">
          <LocationContactCard locale={locale} locationName={locationName}
            defaults={defaults} contact={contact} onSave={onSaveLocation}
            announce={announce} onDirtyChange={onLocationDirty}
            keepUnsavedOnConflict={keepUnsavedOnConflict} />
        </div>
        {canEditCompany ? <details className="opt2-more">
          <summary>{translate(locale, "Company contact defaults", "بيانات التواصل الافتراضية للشركة")}</summary>
          <div data-widget="company">
            <CompanyDefaultsCard locale={locale} companyName={companyName}
              defaults={defaults} onSave={onSaveCompany} announce={announce}
              canEdit={canEditCompany} onDirtyChange={onCompanyDirty}
              keepUnsavedOnConflict={keepUnsavedOnConflict} />
          </div>
        </details> : null}
        <details className="opt2-more" data-guest-preview>
          <summary>{translate(locale, "Guest preview", "معاينة الضيف")}</summary>
          <div data-widget="preview">
            {preview.loading ? <div className="v-empty" role="status">
              {translate(locale, "Loading…", "جارٍ التحميل…")}
            </div> : preview.error ? (
              <div className="v-empty" role="alert">
                {accessError
                  ? translate(locale, "Guest preview access is not authorized.",
                    "الوصول إلى معاينة الضيف غير مصرح به.")
                  : translate(locale, "Guest preview could not be loaded.",
                    "تعذر تحميل معاينة الضيف.")}{" "}
                <button type="button" onClick={preview.refresh}>
                  {translate(locale, "Retry", "إعادة المحاولة")}
                </button>
              </div>
            ) : preview.data ? (
              <GuestPreviewCard locale={locale} defaults={defaults}
                contact={contact} preview={preview.data} />
            ) : <div className="v-empty" role="status">
              {translate(locale, "No guest preview is available for this Location.",
                "لا توجد معاينة ضيف متاحة لهذا الموقع.")}
            </div>}
          </div>
        </details>
      </div>
    </section>
  );
}
