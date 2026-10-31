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
          ? "جاهزية إعداد الحضور"
          : "Presence setup readiness"}
      </summary>
      <div className="ps-related">
        <p>
          {state.state === "INACTIVE"
            ? ar
              ? "غير منطبق — وضعا البداية والنهاية متوقفان."
              : "Not applicable — Start and End modes are Off."
            : state.state === "READY"
              ? ar
                ? "جاهز — تستوفي إعدادات الحضور المحفوظة شروط الجاهزية."
                : "Ready — saved attendance setup meets readiness checks."
              : ar
                ? "غير جاهز — راجع السياسات والمناطق النشطة وأسباب عدم الجاهزية."
                : "Not ready — review policies, active zones and readiness blockers."}
        </p>
        <ContextHelp
          helpKey="presence.readiness"
          locale={locale}
          scopeIdentity={identity}
        />
      </div>
      <p className="ps-inline-note">
        {ar
          ? "تستند الجاهزية إلى السياسات والمناطق المحفوظة. يُعاد التحقق عند إجراءات المناوبة."
          : "Readiness reflects saved policies and zones. Shift actions check again."}
      </p>
    </details>
  );
}
