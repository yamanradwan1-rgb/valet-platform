import { staffSessionLockFunction } from "./option-c-staff-session-lock-acl.mjs";

export const tableMutationContract = Object.freeze({
  staff_auth_sessions: { INSERT: [], UPDATE: [] },
  staff_refresh_credentials: { INSERT: [], UPDATE: [] },
  user_mfa_totp_factors: { INSERT: [], UPDATE: [] },
  mfa_recovery_codes: { INSERT: [], UPDATE: [] },
  anti_abuse_events: { INSERT: [], UPDATE: [] },
});

export const optionCFunctionContract = Object.freeze({
  staffAuth: [
    "public.staff_onboarding_activate(text,text,text)",
    "public.s04_staff_login_success(uuid,text)",
    "public.s04_staff_activation_success(uuid,text,text,text,xid8,uuid,bigint,text)",
  ],
  mfa: ["public.s04_mfa_success(uuid,text,text)"],
  management: [
    "public.staff_management_authorized_set_role(uuid,uuid,text,uuid,uuid,uuid,integer,public.membership_role)",
    "public.staff_management_authorized_set_status(uuid,uuid,text,uuid,uuid,uuid,integer,public.membership_status)",
    "public.staff_management_authorized_set_location_access(uuid,uuid,text,uuid,uuid,uuid,integer,uuid[],boolean)",
    "public.staff_management_authorized_onboarding_create(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,public.membership_role,uuid[],text)",
    "public.staff_management_authorized_onboarding_resend(uuid,uuid,text,uuid,uuid,uuid,uuid,text,text)",
  ],
  retiredManagement: [
    "public.staff_management_set_role(uuid,uuid,uuid,integer,public.membership_role)",
    "public.staff_management_set_status(uuid,uuid,uuid,integer,public.membership_status)",
    "public.staff_management_set_location_access(uuid,uuid,uuid,integer,uuid[],boolean)",
    "public.staff_onboarding_create(uuid,uuid,uuid,text,text,text,text,public.membership_role,uuid[],text)",
    "public.staff_onboarding_resend(uuid,uuid,uuid,uuid,text,text)",
  ],
  mfaActivity:
    "mfa_activity_private.touch_admin_activity(uuid,uuid,text,uuid,integer,text,bigint,bytea)",
  runtimeSessionLock: staffSessionLockFunction,
});
