export interface TranslationDictionary {
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
  'nav.vehicle': string;
  'nav.payment': string;
  'nav.help': string;

  // More Menu
  'menu.title': string;
  'menu.languageLabel': string;
  'menu.languageSub': string;
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
  'system.lastRecordedState': string;
  'system.expiredTitle': string;
  'system.expiredSub': string;
  'system.requestErrorTitle': string;
  'system.requestErrorDefault': string;

  // API & Runtime Errors
  'errors.ANTI_ABUSE_UNAVAILABLE': string;
  'errors.GUEST_ACCESS_INVALID': string;
  'errors.GUEST_ACCESS_RATE_LIMITED': string;
  'errors.HANDOFF_VERIFICATION_FAILED': string;
  'errors.HANDOFF_VERIFICATION_RATE_LIMITED': string;
  'errors.HANDOFF_VERIFICATION_NOT_ACTIVE': string;
  'errors.INVALID_STATE_TRANSITION': string;
  'errors.RETRIEVAL_REQUEST_NOT_READY': string;
  'errors.VERSION_CONFLICT': string;
  'errors.SERVICE_UNAVAILABLE': string;
  'errors.REQUEST_FAILED': string;
  'errors.NETWORK_ERROR': string;
  'errors.GENERIC_ERROR': string;

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
  'help.title': string;
  'help.valetDesk': string;
  'help.valetDeskValue': string;
  'help.emergency': string;
  'help.emergencyValue': string;
  'help.paymentInfo': string;

  // Dev Demo Navigator
  'demo.navigatorTitle': string;
  'demo.expand': string;
  'demo.collapse': string;
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
  'demo.networkUnavailable': string;
  'demo.expired': string;
}

export type TranslationKey = keyof TranslationDictionary;
