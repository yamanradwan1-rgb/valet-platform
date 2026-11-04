import type { ManagementAlertReaderInput } from "./management-alert-source-contract";

/** Internal source-only result. The public alert DTO is owned by Prime. */
export interface FinancialAlertSourceCase {
  readonly category: "ALT-10" | "ALT-11";
  readonly severity: "IMPORTANT";
  readonly sourceKind: "PAYMENT";
  readonly sourceId: string;
  readonly episodeId: string;
  readonly organizationId: string;
  readonly locationId: string;
  readonly occurredAt: string;
  readonly title: string;
}

export interface FinancialAlertReaderInput extends ManagementAlertReaderInput {
  readonly unknownDelaySeconds: number;
}

export interface FinancialAlertExactReaderInput extends Omit<
  FinancialAlertReaderInput,
  "limit"
> {
  readonly category: FinancialAlertSourceCase["category"];
  readonly sourceId: string;
  readonly episodeId: string;
}

export interface FinancialAlertSourceRow {
  readonly operationId: string;
  readonly paymentId: string;
  readonly valetSessionId: string;
  readonly sourceAt: Date;
}
