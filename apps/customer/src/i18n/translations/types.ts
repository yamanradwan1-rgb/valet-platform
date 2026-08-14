export interface TranslationDictionary {
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

  'header.backAria': string;
  'header.moreAria': string;
  'nav.ariaLabel': string;
  'nav.vehicle': string;
  'nav.payment': string;
  'nav.help': string;

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

  'trust.title': string;
  'trust.sub': string;

  'journey.requested': string;
  'journey.onTheWay': string;
  'journey.ready': string;

  'states.CHECKING_IN': string;
  'states.AWAITING_PARKING': string;
  'states.PARKING': string;
  'states.PARKED': string;
  'states.REQUESTED': string;
  'states.RETRIEVING': string;
  'states.READY': string;
  'states.HANDOFF_PENDING': string;
  'states.COMPLETED': string;

  'received.statusReceived': string;
  'received.statusParking': string;
  'received.statusAwaiting': string;
  'received.cardTitle': string;
  'received.cardSub': string;

  'parked.badge': string;
  'parked.locationLabel': string;
  'parked.locationValue': string;
  'parked.statusLabel': string;
  'parked.statusValue': string;
  'parked.requestButton': string;

  'confirmRequest.title': string;
  'confirmRequest.description': string;
  'confirmRequest.queueLabel': string;
  'confirmRequest.queueStatus': string;
  'confirmRequest.confirmButton': string;
  'confirmRequest.cancelButton': string;

  'requested.badge': string;
  'requested.cardTitle': string;
  'requested.cardSub': string;
  'requested.cancelButton': string;
  'requested.cancelling': string;

  'onTheWay.badge': string;
  'onTheWay.cardTitle': string;
  'onTheWay.cardSub': string;

  'ready.badge': string;
  'ready.title': string;
  'ready.cardTitle': string;
  'ready.cardSub': string;

  'verifying.title': string;
  'verifying.subtitle': string;

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

  'handoffQr.badge': string;
  'handoffQr.title': string;
  'handoffQr.instruction': string;
  'handoffQr.updatesEvery': string;
  'handoffQr.refreshButton': string;
  'handoffQr.refreshing': string;
  'handoffQr.switchToPin': string;
  'handoffQr.generationError': string;
  'handoffQr.ariaLabel': string;

  'completed.badge': string;
  'completed.title': string;
  'completed.subtitle': string;
  'completed.cardTitle': string;
  'completed.cardSub': string;
  'completed.devPreviews': string;
  'completed.receiptPreview': string;
  'completed.ratingPreview': string;

  'system.networkUnavailableTitle': string;
  'system.networkUnavailableSub': string;
  'system.lastRecordedState': string;
  'system.expiredTitle': string;
  'system.expiredSub': string;
  'system.requestErrorTitle': string;
  'system.requestErrorDefault': string;

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
  'issueSubmitted.referenceLabel': string;
  'issueSubmitted.message': string;
  'issueSubmitted.doneButton': string;

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
  'demo.help': string;
  'demo.networkUnavailable': string;
  'demo.paymentError': string;
  'demo.requestError': string;
  'demo.expired': string;
  'demo.overlayConfirmRequest': string;
  'demo.overlayVehicleDetails': string;
  'demo.overlayMoreMenu': string;
}

export type TranslationKey = keyof TranslationDictionary;
