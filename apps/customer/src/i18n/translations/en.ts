import type { TranslationDictionary } from './types';
import { guestPostVisitEnTranslations } from './guest-post-visit-en';
import { previewEnTranslations } from './preview-en';
import { guestInformationEnTranslations } from './guest-information-en';

export const enTranslations: TranslationDictionary = {
  // Common
  'common.appName': 'VAYLET',
  'common.poweredBy': 'Powered by VAYLET',
  'common.close': 'Close',
  'common.back': 'Back',
  'common.done': 'Done',
  'common.tryAgain': 'Try again',
  'common.refresh': 'Refresh status',
  'common.loading': 'Loading...',
  'common.loadingSession': 'Loading valet session...',
  'common.loadingQr': 'Loading QR code...',

  // Header & Nav
  'header.backAria': 'Go back',
  'header.moreAria': 'More options',
  'nav.ariaLabel': 'Guest navigation',

  // More Menu
  'menu.title': 'More options',
  'menu.languageLabel': 'العربية',
  'menu.languageSub': 'التبديل إلى اللغة العربية',
  'menu.darkModeLabel': 'Dark mode',
  'menu.darkModeSub': 'Switch between light and dark themes',
  'menu.darkModeAria': 'Toggle dark mode',
  'menu.photosLabel': 'Vehicle condition photos',
  'menu.photosSub': 'Check-in photos preview',
  'menu.privacyLabel': 'Privacy & Terms',
  'menu.privacySub': 'Data protection policies',
  'menu.contactLabel': 'Call valet desk',
  'menu.contactSub': 'Direct operator contact',

  // Vehicle
  'vehicle.yourVehicle': 'Your vehicle',
  'vehicle.defaultMake': 'Vehicle',
  'vehicle.detailsTitle': 'Vehicle details',
  'vehicle.make': 'Make',
  'vehicle.model': 'Model',
  'vehicle.color': 'Color',
  'vehicle.status': 'Status',
  'vehicle.unknown': 'Unknown',
  'vehicle.notSpecified': 'Not specified',
  'vehicle.viewDetails': 'View vehicle details',

  // Trust Strip
  'trust.title': 'Protected handoff',
  'trust.sub': 'One-time pickup verification',

  // Journey
  'journey.requested': 'Requested',
  'journey.onTheWay': 'On the way',
  'journey.ready': 'Ready',

  // Lifecycle States Presentation
  'states.CHECKING_IN': 'Checking in',
  'states.AWAITING_PARKING': 'Awaiting parking',
  'states.PARKING': 'Parking in progress',
  'states.PARKED': 'Safely parked',
  'states.REQUESTED': 'Vehicle requested',
  'states.RETRIEVING': 'On the way',
  'states.READY': 'Ready for pickup',
  'states.HANDOFF_PENDING': 'Ready for handoff',
  'states.COMPLETED': 'Completed',

  // Received Screen
  'received.statusReceived': 'Vehicle received',
  'received.statusParking': 'Parking in progress',
  'received.statusAwaiting': 'Awaiting parking',
  'received.cardTitle': "We're checking in your vehicle.",
  'received.cardSub': "We'll update you as soon as it's parked safely.",

  // Parked Screen
  'parked.badge': 'Safely parked',
  'parked.locationLabel': 'Location',
  'parked.locationValue': 'Secure parking',
  'parked.statusLabel': 'Status',
  'parked.statusValue': 'Safely parked',
  'parked.requestButton': 'Request vehicle',

  // Confirm Request Overlay
  'confirmRequest.title': 'Request your vehicle?',
  'confirmRequest.description':
    'Your request will be added to the retrieval queue. Keep this page open to see the latest vehicle status.',
  'confirmRequest.queueLabel': 'Retrieval queue',
  'confirmRequest.queueStatus': 'Ready to be assigned',
  'confirmRequest.confirmButton': 'Request vehicle',
  'confirmRequest.cancelButton': 'Not yet',

  // Requested Screen
  'requested.badge': 'Vehicle requested',
  'requested.cardTitle': 'Your request has been received.',
  'requested.cardSub': 'Queued for valet retrieval',
  'requested.cancelButton': 'Cancel request',
  'requested.cancelling': 'Cancelling request...',

  // On the way Screen
  'onTheWay.badge': 'On the way',
  'onTheWay.cardTitle': 'Your vehicle is being retrieved.',
  'onTheWay.cardSub': 'Valet en route to staging area',

  // Ready Screen (Waiting)
  'ready.badge': 'Ready for pickup',
  'ready.title': 'Your {vehicle} is ready.',
  'ready.cardTitle': 'Your valet is preparing secure handoff.',
  'ready.cardSub':
    'Your one-time pickup code or QR will appear as soon as the valet begins verification.',
  'readyAlert.title': 'Your vehicle is ready',
  'readyAlert.body': 'Your vehicle has arrived at the pickup area.',

  // Verifying Screen
  'verifying.title': 'Verifying pickup',
  'verifying.subtitle': 'Please wait while the valet completes release...',

  // Handoff PIN Screen
  'handoffPin.badge': 'Ready for pickup',
  'handoffPin.title': 'Your {vehicle} is ready.',
  'handoffPin.instruction': 'Show this PIN to your valet',
  'handoffPin.pickupCodeLabel': 'Pickup code',
  'handoffPin.showCodeSub': 'Show this code to the valet',
  'handoffPin.expiresIn': 'Expires in {time}',
  'handoffPin.expired': 'Expired',
  'handoffPin.oneTime': 'One-time verification · Expires after use',
  'handoffPin.refreshButton': 'Generate new code',
  'handoffPin.refreshing': 'Refreshing...',
  'handoffPin.switchToQr': 'Show QR code instead',

  // Handoff QR Screen
  'handoffQr.badge': 'Ready for pickup',
  'handoffQr.title': 'Your {vehicle} is ready.',
  'handoffQr.instruction': 'Valet will scan this code to confirm handoff',
  'handoffQr.updatesEvery': 'Updates every 2 min · Expires in {seconds}s',
  'handoffQr.refreshButton': 'Get new QR',
  'handoffQr.refreshing': 'Refreshing...',
  'handoffQr.switchToPin': 'Show pickup code instead',
  'handoffQr.generationError': 'QR generation error',
  'handoffQr.ariaLabel': 'Secure Dynamic QR Code',

  // Completed Screen
  'completed.badge': 'Session complete',
  'completed.title': 'Your {vehicle} has been released.',
  'completed.subtitle': 'Custody transfer is complete. Thank you for using VAYLET.',
  'completed.cardTitle': 'Vehicle Safely Returned',
  'completed.cardSub': 'Valet service complete',
  'completed.devPreviews': 'Dev Previews (Future Phases)',
  'completed.receiptPreview': 'Receipt Preview',
  'completed.ratingPreview': 'Rating Preview',

  // T5 real post-visit rating
  'rating.liveTitle': 'Rate your experience',
  'rating.submit': 'Submit rating',
  'rating.submitting': 'Submitting…',
  'rating.saved': 'Thanks for your feedback.',
  'rating.conflict': 'A rating has already been recorded for this visit.',
  'rating.unknown': 'We cannot confirm whether your rating was recorded. It will not be sent again automatically.',
  'rating.unavailable': 'Rating is available only for your completed authorized visit.',
  'rating.failed': "We couldn't submit your rating. Try again.",
  'rating.selectStar': 'Select {star} out of 5 stars',

  // System & Error Screens
  'system.networkUnavailableTitle': 'Network unavailable',
  'system.rateLimitedTitle': 'Please wait a moment',
  'system.rateLimitedSub': 'Too many status requests. You can refresh when the wait time ends.',
  'system.temporaryUnavailableTitle': 'Service temporarily unavailable',
  'system.temporaryUnavailableSub': 'Your current status could not be confirmed. Please try again.',
  'system.staleStatusNotice': 'Your last vehicle status may be out of date. Actions are paused until it is confirmed.',
  'system.cooldownNotice': 'Please wait {seconds}s before refreshing.',
  'system.networkUnavailableSub': 'Connection lost. Your current vehicle status is preserved.',
  'system.lastRecordedState': 'Last recorded state: {state}',
  'system.expiredTitle': 'Valet session unavailable',
  'system.expiredSub':
    'This link is invalid or has expired. Please open the link sent to your phone during check-in.',
  'system.requestErrorTitle': 'Request could not be sent',
  'system.requestErrorDefault': 'Please try again or contact the valet desk.',

  // Same-browser Guest visit context conflict
  'contextConflict.title': 'You already have an open visit',
  'contextConflict.activeBody':
    'This browser is connected to another visit. Choose which visit you want to continue.',
  'contextConflict.postVisitBody':
    'You still have access to your previous visit. Opening the new visit will move this browser to it.',
  'contextConflict.continueCurrent': 'Continue current visit',
  'contextConflict.openNew': 'Open new visit',

  // API & Runtime Errors
  'errors.ANTI_ABUSE_UNAVAILABLE':
    'Service temporarily unavailable. Please try again in a few moments.',
  'errors.GUEST_ACCESS_INVALID': 'This valet session link is invalid or has expired.',
  'errors.GUEST_ACCESS_RATE_LIMITED': 'Too many requests. Please wait a moment and try again.',
  'errors.HANDOFF_VERIFICATION_FAILED':
    'Verification failed. Please check your pickup code or QR code.',
  'errors.HANDOFF_VERIFICATION_RATE_LIMITED':
    'Too many verification attempts. Please wait a moment.',
  'errors.HANDOFF_VERIFICATION_NOT_ACTIVE': 'Vehicle is not currently ready for handoff.',
  'errors.HANDOFF_VERIFICATION_ALREADY_ISSUED': 'A pickup proof is already active. Ask staff for help if it is not visible.',
  'errors.HANDOFF_VERIFICATION_ALREADY_VERIFIED': 'Pickup verification is already complete.',
  'errors.MUTATION_OUTCOME_UNKNOWN': 'This action may have gone through. Check your current status before trying again.',
  'errors.REQUEST_TIMEOUT': 'The request timed out. Please try again.',
  'errors.INVALID_RESPONSE': 'The server sent an unexpected response. Please refresh.',
  'errors.GUEST_REQUEST_CANCELLED': 'The request was cancelled.',
  'errors.INVALID_STATE_TRANSITION':
    'Unable to perform this action for the vehicle’s current state.',
  'errors.RETRIEVAL_REQUEST_NOT_READY':
    'Retrieval request is not currently available for this vehicle.',
  'errors.VERSION_CONFLICT': 'The session state has changed. Refreshing your status...',
  'errors.SERVICE_UNAVAILABLE':
    'Service is temporarily unavailable. Please try again shortly.',
  'errors.REQUEST_FAILED': 'Unable to process your request. Please try again.',
  'errors.NETWORK_ERROR':
    'Network connection error. Please check your internet connection.',
  'errors.GENERIC_ERROR': 'An unexpected error occurred. Please try again.',

  // Deferred Previews (Payment, Service)
  'payment.previewBanner':
    'Preview Only · Payment phase is not yet connected to production backend.',
  'payment.overviewTitle': 'Payment Preview',
  'payment.serviceLabel': 'Valet Service',
  'payment.complimentary': 'Complimentary',
  'payment.tipLabel': 'Tip',
  'payment.notAdded': 'Not added',
  'payment.estimatedTotal': 'Estimated Total',
  'payment.previewAddTip': 'Preview Add Tip',
  'payment.previewReceipt': 'Preview Receipt',
  'payment.addTipTitle': 'Add a Tip (Preview)',
  'payment.tipBanner': 'Preview Only · Tip configuration is deferred to payments phase.',
  'payment.receiptTitle': 'Receipt Preview',
  'payment.receiptBanner':
    'Preview Only · Receipts will be generated from backend settlement records.',
  'payment.service': 'Service',
  'payment.standardValet': 'Standard Valet',
  'payment.status': 'Status',
  'payment.total': 'Total',

  'help.rateTitle': 'Rate Your Experience (Preview)',
  'help.rateBanner':
    'Preview Only · Guest feedback collection is deferred to customer portal phase.',

  // Dev Demo Navigator
  'demo.navigatorTitle': 'Dev Preview Navigator',
  'demo.expand': 'Expand',
  'demo.collapse': 'Collapse',
  'demo.live': '🟢 Live (API)',
  'demo.received': '1. Received',
  'demo.parked': '2. Parked',
  'demo.requested': '3. Requested',
  'demo.onTheWay': '4. On the way',
  'demo.ready': '5. Ready (Wait)',
  'demo.readyPin': '6. PIN Handoff',
  'demo.readyQr': '7. QR Handoff',
  'demo.verifying': '8. Verifying',
  'demo.completed': '9. Completed',
  'demo.networkUnavailable': 'Net Unavailable',
  'demo.expired': 'Expired',
  ...guestPostVisitEnTranslations,
  ...guestInformationEnTranslations,
  ...previewEnTranslations,
};

export const en = enTranslations;
