import { Building2, MapPin } from "lucide-react";
import { useStudio } from "./studio-context";
import { locations, organizations } from "./fixtures";
import { ui } from "./copy";

export function SettingsScope() {
  const { route, locale, navigate } = useStudio();
  const ar = locale === "ar";
  const copy = ui[locale];
  const organization = organizations.find((item) => item.id === route.org)!;
  const location = locations.find((item) => item.id === route.location);
  return (
    <div className="ps-context-bar">
      <div className="ps-context-choice">
        <span className="ps-context-label">
          {ar
            ? "أين تريد تطبيق الإعدادات؟"
            : "Where should these settings apply?"}
        </span>
        <div
          className="ps-scope-switch"
          role="group"
          aria-label={ar ? "نطاق الإعدادات" : "Settings scope"}
        >
          {route.role === "COMPANY_ADMIN" && (
            <button
              type="button"
              aria-label={copy.company}
              aria-pressed={route.scope === "company"}
              onClick={() => navigate({ scope: "company" })}
            >
              <Building2 size={17} aria-hidden="true" />
              <span>
                <strong>{copy.company}</strong>
                <small>
                  {ar
                    ? "للمواقع التي لا تملك تخصيصًا"
                    : "For locations without an override"}
                </small>
              </span>
            </button>
          )}
          <button
            type="button"
            aria-label={copy.location}
            aria-pressed={route.scope === "location"}
            onClick={() => navigate({ scope: "location" })}
          >
            <MapPin size={17} aria-hidden="true" />
            <span>
              <strong>{copy.location}</strong>
              <small>
                {ar ? "تغيير هذا الموقع فقط" : "Change this location only"}
              </small>
            </span>
          </button>
        </div>
      </div>
      <div className="ps-context-name">
        <span>
          {route.scope === "company"
            ? ar
              ? "الشركة الحالية"
              : "Current company"
            : ar
              ? "الموقع الحالي"
              : "Current location"}
        </span>
        <strong>
          <bdi>
            {route.scope === "company"
              ? organization[locale]
              : (location?.[locale] ?? copy.noLocation)}
          </bdi>
        </strong>
      </div>
    </div>
  );
}
