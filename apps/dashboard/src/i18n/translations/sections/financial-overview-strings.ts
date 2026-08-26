/**
 * Financial Overview surface strings (D4-001).
 */

export interface FinancialOverviewStrings {
  "financial.infoNote": string;
  "financial.loading": string;
  "financial.action.retry": string;
  "financial.error.loadFailed": string;
  "financial.error.network": string;
  "financial.error.accessDenied": string;
  "financial.currencyGroupLabel": string;
  "financial.currentLocationCurrency": string;
  "financial.fact.paymentCount": string;
  "financial.fact.amountDue": string;
  "financial.fact.amountPaid": string;
  "financial.fact.tips": string;
  "financial.fact.succeededRefunds": string;
  "financial.fact.currentValidationAmount": string;
  "financial.statusCountsTitle": string;
  "financial.collectionMethodsTitle": string;
  "financial.empty": string;
}

export const financialOverviewEn: FinancialOverviewStrings = {
  "financial.infoNote":
    "Amounts are grouped by the currency recorded on each payment. Currencies are never converted or combined.",
  "financial.loading": "Loading financial overview…",
  "financial.action.retry": "Retry",
  "financial.error.loadFailed":
    "We couldn't load the financial overview right now. Please try again.",
  "financial.error.network":
    "Network connection unavailable. Check your connection and try again.",
  "financial.error.accessDenied":
    "You don't have access to this location's financial overview.",
  "financial.currencyGroupLabel": "Currency group",
  "financial.currentLocationCurrency": "Current location currency",
  "financial.fact.paymentCount": "Payment count",
  "financial.fact.amountDue": "Amount due",
  "financial.fact.amountPaid": "Amount paid",
  "financial.fact.tips": "Tips",
  "financial.fact.succeededRefunds": "Succeeded refunds",
  "financial.fact.currentValidationAmount": "Current validation amount",
  "financial.statusCountsTitle": "Payment status counts",
  "financial.collectionMethodsTitle": "Collection method counts",
  "financial.empty":
    "No payment activity recorded for this location yet.",
};

export const financialOverviewAr: FinancialOverviewStrings = {
  "financial.infoNote":
    "تُجمَّع المبالغ حسب العملة المسجلة على كل عملية دفع. لا يتم تحويل العملات أو دمجها أبدًا.",
  "financial.loading": "جارٍ تحميل النظرة المالية…",
  "financial.action.retry": "إعادة المحاولة",
  "financial.error.loadFailed":
    "تعذر تحميل النظرة المالية الآن. حاول مرة أخرى.",
  "financial.error.network":
    "اتصال الشبكة غير متاح. تحقق من اتصالك وحاول مرة أخرى.",
  "financial.error.accessDenied":
    "ليس لديك صلاحية الوصول إلى النظرة المالية لهذا الموقع.",
  "financial.currencyGroupLabel": "مجموعة العملة",
  "financial.currentLocationCurrency": "عملة الموقع الحالية",
  "financial.fact.paymentCount": "عدد المدفوعات",
  "financial.fact.amountDue": "المبلغ المستحق",
  "financial.fact.amountPaid": "المبلغ المدفوع",
  "financial.fact.tips": "الإكراميات",
  "financial.fact.succeededRefunds": "المبالغ المستردة الناجحة",
  "financial.fact.currentValidationAmount": "مبلغ التحقق الحالي",
  "financial.statusCountsTitle": "إحصاءات حالات الدفع",
  "financial.collectionMethodsTitle": "إحصاءات طرق التحصيل",
  "financial.empty": "لا يوجد نشاط مدفوعات مسجل لهذا الموقع بعد.",
};
