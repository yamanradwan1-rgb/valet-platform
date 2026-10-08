export interface GuestPostVisitTranslationTypes {
  'rating.star1': string;
  'rating.star2': string;
  'rating.star3': string;
  'rating.star4': string;
  'rating.star5': string;
  'paymentSummary.title': string;
  'paymentSummary.noPaymentRequired': string;
  'paymentSummary.service': string;
  'paymentSummary.tip': string;
  'paymentSummary.amountDue': string;
  'paymentSummary.amountPaid': string;
  'paymentSummary.method': string;
  'paymentSummary.paidAt': string;
  'paymentSummary.status': string;
  'paymentSummary.refunds': string;
  'paymentSummary.loadFailed': string;
  'paymentSummary.method.NONE': string;
  'paymentSummary.method.CASH': string;
  'paymentSummary.method.DIGITAL': string;
  'paymentSummary.status.NOT_REQUIRED': string;
  'paymentSummary.status.UNPAID': string;
  'paymentSummary.status.PENDING': string;
  'paymentSummary.status.PAID': string;
  'paymentSummary.status.FAILED': string;
  'paymentSummary.refund.SUCCEEDED': string;
  'help.onsiteEntry': string;
  'help.onsiteTitle': string;
  'help.onsiteBody': string;
}

export type GuestPostVisitTranslationDictionary = {
  readonly [Key in keyof GuestPostVisitTranslationTypes]: string;
};
