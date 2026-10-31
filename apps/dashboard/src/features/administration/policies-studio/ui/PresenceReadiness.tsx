import { ContextHelp } from "../../../../features/help/context-help";
import { useStudio } from "./studio-context";

export function PresenceReadiness() {
  const { route, adapter, locale, identity } = useStudio();
  if (route.scope !== "location" || route.location === "none") return null;
  const ar = locale === "ar";
  const state = adapter.presence.readiness;
  return (
    <details className="ps-editor-context">
      <summary>
        {ar
          ? "جاهزية إعداد الحضور · محاكاة محلية"
          : "Presence setup readiness · local simulation"}
      </summary>
      <div className="ps-related">
        <p>
          {state.state === "INACTIVE"
            ? ar
              ? "غير منطبق — وضعا البداية والنهاية متوقفان."
              : "Not applicable — Start and End modes are Off."
            : state.state === "READY"
              ? ar
                ? "توجد منطقة حضور نشطة صالحة في بيانات النموذج."
                : "A usable active attendance zone exists in the fixture."
              : ar
                ? "غير جاهز — احفظ منطقة حضور نشطة قبل اختيار وضع إلزامي."
                : "Not ready — save an active attendance zone before choosing a strict mode."}
        </p>
        <ContextHelp
          helpKey="presence.readiness"
          locale={locale}
          scopeIdentity={identity}
        />
      </div>
      <p className="ps-inline-note">
        {ar
          ? "هذه قراءة للبيانات المحلية فقط؛ الخادم هو صاحب القرار في الإنتاج."
          : "This reads local fixture data only; production readiness remains server-authoritative."}
      </p>
    </details>
  );
}
