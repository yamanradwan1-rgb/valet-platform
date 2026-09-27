import type { DashboardLocale } from "../../lib/i18n/locale";
import type {
  PaymentsCurrentPresentation,
  PaymentsPeriodPresentation,
} from "./payments-presentation";

export interface PaymentsBreakdownProps {
  readonly current: PaymentsCurrentPresentation | null;
  readonly currentError: string | null;
  readonly currentLoading: boolean;
  readonly locale: DashboardLocale;
  readonly mode: "COMPANY" | "LOCATION";
  readonly onRetryCurrent: () => void;
  readonly onRetryPeriod: () => void;
  readonly period: PaymentsPeriodPresentation | null;
  readonly periodError: string | null;
  readonly periodLoading: boolean;
  readonly periodSelected: boolean;
}
