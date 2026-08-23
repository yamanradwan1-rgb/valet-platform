import { cookies } from "next/headers";
import type { JSX } from "react";

import { EmployeeApp } from "../components/employee-app";
import {
  EmployeeI18nProvider,
} from "../components/shell/employee-i18n";
import {
  isEmployeeLocale,
  LOCALE_COOKIE,
} from "../lib/i18n/dictionary";
import { StaffAuthProvider } from "../lib/auth/staff-auth-context";

export default async function Home(): Promise<JSX.Element> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isEmployeeLocale(raw) ? raw : "en";

  return (
    <EmployeeI18nProvider key={locale}>
      <StaffAuthProvider>
        <EmployeeApp />
      </StaffAuthProvider>
    </EmployeeI18nProvider>
  );
}
