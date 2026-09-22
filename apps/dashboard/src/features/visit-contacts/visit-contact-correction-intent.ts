export interface VisitContactCorrectionIntent {
  readonly clearName: boolean;
  readonly customerId: string;
  readonly draft: string;
  readonly kind: "NAME" | "PHONE";
  readonly reviewRequired: boolean;
  readonly sessionGeneration: number;
}
