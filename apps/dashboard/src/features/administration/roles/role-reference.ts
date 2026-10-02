import type { StaffManagementRole } from "@valet/contracts";
import type { DashboardLocale } from "../../../lib/i18n/locale";

interface RoleReferenceText {
  readonly label: string;
  readonly scope: string;
  readonly capabilities: string;
  readonly conditions: string;
}

// Presentation only. DEC-078/080/081/083/085/088 and current server authorizers
// own these boundaries; this reference never grants or infers permission.
const definitions = {
  ORG_ADMIN: {
    en: {
      label: "Company Admin",
      scope: "Organization-wide Management, across its Locations.",
      capabilities:
        "Manage staff roles/access, Location lifecycle, settings, physical resources and branding; view analytics, reports and shifts.",
      conditions:
        "Current entitlements and MFA assurance apply; sensitive commands require fresh MFA. Staff changes retain handover and last-admin protections. No field-operation eligibility.",
    },
    ar: {
      label: "مدير الشركة",
      scope: "إدارة على مستوى الشركة تشمل مواقعها.",
      capabilities:
        "إدارة أدوار الموظفين وصلاحيات المواقع ودورة حياة المواقع والإعدادات والموارد المادية والهوية البصرية؛ عرض التحليلات والتقارير والورديات.",
      conditions:
        "تطبق الاستحقاقات الحالية والتحقق متعدد العوامل؛ الأوامر الحساسة تتطلب تحققًا حديثًا. تخضع تغييرات الموظفين لضوابط تسليم المسؤوليات وحماية آخر مدير. لا يمنح أهلية للعمل الميداني.",
    },
  },
  LOCATION_MANAGER: {
    en: {
      label: "Location Manager",
      scope: "Currently granted active Locations only.",
      capabilities:
        "View operations/reports/shifts; manage Location settings, branding/resources and eligible Employee/Supervisor onboarding, roles, status and grants.",
      conditions:
        "Staff targets need non-empty grants fully within the manager’s current active grants. Employee ↔ Supervisor only; no Admin/Manager creation or elevation. Sensitive staff/shift commands require fresh MFA. No field-operation eligibility.",
    },
    ar: {
      label: "مدير الموقع",
      scope: "المواقع النشطة الممنوحة حاليًا فقط.",
      capabilities:
        "عرض العمليات والتقارير والورديات؛ إدارة إعدادات الموقع وهويته وموارده وإضافة الموظفين والمشرفين المؤهلين وأدوارهم وحالتهم وصلاحيات مواقعهم.",
      conditions:
        "يجب أن تكون صلاحيات مواقع الموظف غير فارغة وضمن صلاحيات المدير الحالية للمواقع النشطة بالكامل. تغيير الدور بين الموظف والمشرف فقط؛ لا إنشاء أو ترقية لمدير شركة أو موقع. أوامر الموظفين والورديات الحساسة تتطلب تحققًا حديثًا متعدد العوامل. لا يمنح أهلية للعمل الميداني.",
    },
  },
  VALET_SUPERVISOR: {
    en: {
      label: "Valet Supervisor",
      scope: "Authorized Location; active shift for task supervision.",
      capabilities:
        "Supervise field work, assign/reassign permitted tasks and carry out authorized vehicle, key-custody and incident workflows.",
      conditions:
        "Current Location access and command-specific shift/ownership guards apply. Reassignment requires a reason and eligible assignee. No general Management administration.",
    },
    ar: {
      label: "مشرف صف السيارات",
      scope: "الموقع المصرح به؛ وردية نشطة للإشراف على المهام.",
      capabilities:
        "الإشراف على العمل الميداني وتعيين المهام المسموح بها وإعادة تعيينها وتنفيذ إجراءات المركبات وعهدة المفاتيح والحوادث المصرح بها.",
      conditions:
        "تطبق صلاحية الموقع الحالية وضوابط الوردية والمسؤولية الخاصة بكل أمر. إعادة التعيين تتطلب سببًا وموظفًا مؤهلًا. لا يمنح صلاحيات إدارية عامة في لوحة الإدارة.",
    },
  },
  VALET_EMPLOYEE: {
    en: {
      label: "Valet Employee",
      scope: "Authorized Location; active shift for task/key work.",
      capabilities:
        "Check in vehicles, work assigned parking/retrieval tasks, handle key custody, complete secure handoff and report incidents.",
      conditions:
        "Command-specific shift, task/session responsibility and handoff verification guards apply. No staff/configuration management or supervisor overrides.",
    },
    ar: {
      label: "موظف صف السيارات",
      scope: "الموقع المصرح به؛ وردية نشطة للعمل على المهام والمفاتيح.",
      capabilities:
        "تسجيل المركبات وتنفيذ مهام الوقوف والاسترجاع المعينة وإدارة عهدة المفاتيح وإتمام التسليم الآمن والإبلاغ عن الحوادث.",
      conditions:
        "تطبق ضوابط الوردية والمسؤولية عن المهمة أو المركبة والتحقق من التسليم الخاصة بكل أمر. لا إدارة للموظفين أو الإعدادات ولا تجاوزات خاصة بالمشرف.",
    },
  },
} as const satisfies Record<
  StaffManagementRole,
  Record<DashboardLocale, RoleReferenceText>
>;

const roleOrder = [
  "ORG_ADMIN",
  "LOCATION_MANAGER",
  "VALET_SUPERVISOR",
  "VALET_EMPLOYEE",
] as const satisfies readonly StaffManagementRole[];

export function fixedRoleReference(
  locale: DashboardLocale,
): readonly (RoleReferenceText & { readonly role: StaffManagementRole })[] {
  return roleOrder.map((role) => ({ role, ...definitions[role][locale] }));
}

const copy = {
  en: {
    scope: "Scope",
    capabilities: "Capabilities",
    conditions: "Conditions / boundaries",
    explanation:
      "Read-only fixed roles; the server enforces permissions. Manage assignments and Location grants in Employees & Shifts. Management and field roles have separate authority.",
  },
  ar: {
    scope: "النطاق",
    capabilities: "الصلاحيات",
    conditions: "الشروط والحدود",
    explanation:
      "أدوار ثابتة للقراءة فقط؛ يفرض الخادم الصلاحيات. تُدار التعيينات وصلاحيات المواقع من الموظفين والورديات. صلاحيات الإدارة والعمل الميداني منفصلة.",
  },
} as const;

export function roleReferenceCopy(locale: DashboardLocale) {
  return copy[locale];
}
