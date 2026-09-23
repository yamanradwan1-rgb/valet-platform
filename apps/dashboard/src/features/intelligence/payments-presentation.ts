import type {
  CompanyAnalyticsResponse,
  FinancialAnalyticsResponse,
  FinancialOverviewResponse,
} from "@valet/contracts";

export interface PaymentsPeriodPresentation {
  readonly currencies: FinancialAnalyticsResponse["currencies"];
  readonly cashReconciliation: FinancialAnalyticsResponse["cashReconciliation"];
  readonly companyCoverage: CompanyAnalyticsResponse["summary"]["coverage"] | null;
}

export interface PaymentsCurrentPresentation {
  readonly currencies: FinancialOverviewResponse["currencies"];
}

export function locationPaymentsPeriodPresentation(
  response: FinancialAnalyticsResponse,
): PaymentsPeriodPresentation {
  return {
    currencies: response.currencies,
    cashReconciliation: response.cashReconciliation,
    companyCoverage: null,
  };
}

export function companyPaymentsPeriodPresentation(
  response: CompanyAnalyticsResponse,
): PaymentsPeriodPresentation {
  return {
    currencies: response.summary.financial.currencies,
    cashReconciliation: response.summary.financial.cashReconciliation,
    companyCoverage: response.summary.coverage,
  };
}

export function currentPaymentsPresentation(
  response: FinancialOverviewResponse,
): PaymentsCurrentPresentation {
  return { currencies: response.currencies };
}
