import type { GuestErrorTranslationTypes } from './guest-error-translation-types';
import type { GuestPostVisitTranslationTypes } from './guest-post-visit-translation-types';
import type { GuestRatingTranslationTypes } from './guest-rating-translation-types';

export interface TranslationDictionary extends GuestErrorTranslationTypes, GuestPostVisitTranslationTypes, GuestRatingTranslationTypes {
  // Common
  'common.appName': string;
  'common.poweredBy': string;
  'common.close': string;
  'common.back': string;
  'common.done': string;
  'common.tryAgain': string;
  'common.refresh': string;
  'common.loading': string;
  'common.loadingSession': string;
  'common.loadingQr': string;

  // Header & Nav
  'header.backAria': string;
  'header.moreAria': string;
  'nav.ariaLabel': string;

  // More Menu
  'menu.title': string;
  'menu.languageLabel': string;
  'menu.languageSub': string;
  'menu.darkModeLabel': string;
  'menu.darkModeSub': string;
  'menu.darkModeAria': string;
  'menu.photosLabel': string;
  'menu.photosSub': string;
  'menu.privacyLabel': string;
  'menu.privacySub': string;
  'menu.contactLabel': string;
  'menu.contactSub': string;

  // Vehicle
  'vehicle.yourVehicle': string;
  'vehicle.defaultMake': string;
  'vehicle.detailsTitle': string;
  'vehicle.make': string;
  'vehicle.model': string;
  'vehicle.color': string;
  'vehicle.status': string;
  'vehicle.unknown': string;
  'vehicle.notSpecified': string;
  'vehicle.viewDetails': string;

  // Trust Strip
  'trust.title': string;
  'trust.sub': string;

  // Journey
  'journey.requested': string;
  'journey.onTheWay': string;
  'journey.ready': string;

  // Lifecycle States Presentation
  'states.CHECKING_IN': string;
  'states.AWAITING_PARKING': string;
  'states.PARKING': string;
  'states.PARKED': string;
  'states.REQUESTED': string;
  'states.RETRIEVING': string;
  'states.READY': string;
  'states.HANDOFF_PENDING': string;
  'states.COMPLETED': string;

  // Received Screen
  'received.statusReceived': string;
  'received.statusParking': string;
  'received.statusAwaiting': string;
  'received.cardTitle': string;
  'received.cardSub': string;

  // Parked Screen
  'parked.badge': string;
  'parked.locationLabel': string;
  'parked.locationValue': string;
  'parked.statusLabel': string;
  'parked.statusValue': string;
  'parked.requestButton': string;

  // Confirm Request Overlay
  'confirmRequest.title': string;
  'confirmRequest.description': string;
  'confirmRequest.queueLabel': string;
  'confirmRequest.queueStatus': string;
  'confirmRequest.confirmButton': string;
  'confirmRequest.cancelButton': string;

  // Requested Screen
  'requested.badge': string;
  'requested.cardTitle': string;
  'requested.cardSub': string;
  'requested.cancelButton': string;
  'requested.cancelling': string;

  // On the way Screen
  'onTheWay.badge': string;
  'onTheWay.cardTitle': string;
  'onTheWay.cardSub': string;

  // Ready Screen (Waiting)
  'ready.badge': string;
  'ready.title': string;
  'ready.cardTitle': string;
  'ready.cardSub': string;
  'readyAlert.title': string;
  'readyAlert.body': string;

  // Verifying Screen
  'verifying.title': string;
  'verifying.subtitle': string;

  // Handoff PIN Screen
  'handoffPin.badge': string;
  'handoffPin.title': string;
  'handoffPin.instruction': string;
  'handoffPin.pickupCodeLabel': string;
  'handoffPin.showCodeSub': string;
  'handoffPin.expiresIn': string;
  'handoffPin.expired': string;
  'handoffPin.oneTime': string;
  'handoffPin.refreshButton': string;
  'handoffPin.refreshing': string;
  'handoffPin.switchToQr': string;

  // Handoff QR Screen
  'handoffQr.badge': string;
  'handoffQr.title': string;
  'handoffQr.instruction': string;
  'handoffQr.updatesEvery': string;
  'handoffQr.refreshButton': string;
  'handoffQr.refreshing': string;
  'handoffQr.switchToPin': string;
  'handoffQr.generationError': string;
  'handoffQr.ariaLabel': string;

  // Completed Screen
  'completed.badge': string;
  'completed.title': string;
  'completed.subtitle': string;
  'completed.cardTitle': string;
  'completed.cardSub': string;
  'completed.devPreviews': string;
  'completed.receiptPreview': string;
  'completed.ratingPreview': string;

  // System & Error Screens
  'system.networkUnavailableTitle': string;
  'system.networkUnavailableSub': string;
  'system.rateLimitedTitle': string;
  'system.rateLimitedSub': string;
  'system.temporaryUnavailableTitle': string;
  'system.temporaryUnavailableSub': string;
  'system.lastRecordedState': string;
  'system.expiredTitle': string;
  'system.expiredSub': string;
  'system.requestErrorTitle': string;
  'system.requestErrorDefault': string;
  'system.staleStatusNotice': string;
  'system.cooldownNotice': string;

  // Same-browser Guest visit context conflict
  'contextConflict.title': string;
  'contextConflict.activeBody': string;
  'contextConflict.postVisitBody': string;
  'contextConflict.continueCurrent': string;
  'contextConflict.openNew': string;

  // Deferred Previews (Payment, Service)
  'payment.previewBanner': string;
  'payment.overviewTitle': string;
  'payment.serviceLabel': string;
  'payment.complimentary': string;
  'payment.tipLabel': string;
  'payment.notAdded': string;
  'payment.estimatedTotal': string;
  'payment.previewAddTip': string;
  'payment.previewReceipt': string;
  'payment.addTipTitle': string;
  'payment.tipBanner': string;
  'payment.receiptTitle': string;
  'payment.receiptBanner': string;
  'payment.service': string;
  'payment.standardValet': string;
  'payment.status': string;
  'payment.total': string;

  'help.rateTitle': string;
  'help.rateBanner': string;

  // Guest UI Preview Completeness
  'paymentComplimentary.badge': string;
  'paymentComplimentary.title': string;
  'paymentComplimentary.notice': string;
  'paymentComplimentary.valetFee': string;
  'paymentComplimentary.venueValidation': string;
  'paymentComplimentary.amountDue': string;
  'paymentComplimentary.viewReceipt': string;

  'paymentMethod.title': string;
  'paymentMethod.subtitle': string;
  'paymentMethod.applePay': string;
  'paymentMethod.googlePay': string;
  'paymentMethod.card': string;
  'paymentMethod.venue': string;
  'paymentMethod.payButton': string;

  'paymentSuccess.badge': string;
  'paymentSuccess.title': string;
  'paymentSuccess.subtitle': string;
  'paymentSuccess.serviceFee': string;
  'paymentSuccess.tipFee': string;
  'paymentSuccess.totalPaid': string;
  'paymentSuccess.receiptNotice': string;
  'paymentSuccess.viewReceipt': string;
  'paymentSuccess.returnValet': string;

  'paymentError.title': string;
  'paymentError.subtitle': string;
  'paymentError.tryAgain': string;
  'paymentError.changeMethod': string;

  'reportIssue.title': string;
  'reportIssue.subtitle': string;
  'reportIssue.categoryLabel': string;
  'reportIssue.catCondition': string;
  'reportIssue.catPayment': string;
  'reportIssue.catHandoff': string;
  'reportIssue.catService': string;
  'reportIssue.catOther': string;
  'reportIssue.descriptionLabel': string;
  'reportIssue.descriptionPlaceholder': string;
  'reportIssue.photoLabel': string;
  'reportIssue.addPhoto': string;
  'reportIssue.photoAdded': string;
  'reportIssue.submitButton': string;

  'issueSubmitted.badge': string;
  'issueSubmitted.title': string;
  'issueSubmitted.previewBanner': string;
  'issueSubmitted.referenceLabel': string;
  'issueSubmitted.message': string;
  'issueSubmitted.doneButton': string;

  // Dev Demo Navigator
  'demo.navigatorTitle': string;
  'demo.expand': string;
  'demo.collapse': string;
  'demo.groupCore': string;
  'demo.groupPayment': string;
  'demo.groupService': string;
  'demo.groupErrors': string;
  'demo.groupOverlays': string;
  'demo.live': string;
  'demo.received': string;
  'demo.parked': string;
  'demo.requested': string;
  'demo.onTheWay': string;
  'demo.ready': string;
  'demo.readyPin': string;
  'demo.readyQr': string;
  'demo.verifying': string;
  'demo.completed': string;
  'demo.paymentOverview': string;
  'demo.paymentComplimentary': string;
  'demo.addTip': string;
  'demo.paymentMethod': string;
  'demo.paymentSuccess': string;
  'demo.receipt': string;
  'demo.rateExperience': string;
  'demo.reportIssue': string;
  'demo.issueSubmitted': string;
  'demo.networkUnavailable': string;
  'demo.paymentError': string;
  'demo.requestError': string;
  'demo.expired': string;
  'demo.overlayConfirmRequest': string;
  'demo.overlayVehicleDetails': string;
  'demo.overlayMoreMenu': string;
}

export type TranslationKey = keyof TranslationDictionary;
