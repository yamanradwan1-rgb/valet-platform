import {
  EMPLOYEE_LOCALES,
  employeeLocaleDirection,
  type EmployeeLocale,
} from "@valet/employee-client";
import { getNativeEmployeeDictionary } from "../i18n/native-employee-dictionary";

export const FOUNDATION_LOCALES = EMPLOYEE_LOCALES;

export type FoundationLocale = EmployeeLocale;

type FoundationDirection = "ltr" | "rtl";
type FoundationTextAlign = "left" | "right";

interface FoundationCopy {
  appName: string;
  audience: string;
  status: string;
  chooseLanguage: string;
  english: string;
  arabic: string;
  tasks: string;
}

interface FoundationPresentation {
  copy: FoundationCopy;
  direction: FoundationDirection;
  textAlign: FoundationTextAlign;
}

export function getFoundationPresentation(
  locale: FoundationLocale,
): FoundationPresentation {
  const isArabic = locale === "ar";
  const dictionary = getNativeEmployeeDictionary(locale);
  return {
    copy: {
      appName: dictionary.appName,
      audience: isArabic ? "الموظف" : "Employee",
      status: isArabic ? "جاهز للتشغيل" : "Foundation ready",
      chooseLanguage: isArabic ? "اختر اللغة" : "Choose language",
      english: isArabic ? "الإنجليزية" : "English",
      arabic: isArabic ? "العربية" : "Arabic",
      tasks: dictionary.tasksTitle,
    },
    direction: employeeLocaleDirection(locale),
    textAlign: isArabic ? "right" : "left",
  };
}
