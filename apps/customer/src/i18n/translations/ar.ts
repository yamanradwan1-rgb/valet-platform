import type { TranslationDictionary } from './types';

export const arTranslations: TranslationDictionary = {
  // Common
  'common.appName': 'VAYLET',
  'common.poweredBy': 'مشغل بواسطة VAYLET',
  'common.close': 'إغلاق',
  'common.back': 'رجوع',
  'common.done': 'تم',
  'common.tryAgain': 'إعادة المحاولة',
  'common.refresh': 'تحديث الحالة',
  'common.loading': 'جاري التحميل...',
  'common.loadingSession': 'جاري تحميل تفاصيل خدمة الاصطفاف...',
  'common.loadingQr': 'جاري تحميل رمز الاستجابة السريعة...',

  // Header & Nav
  'header.backAria': 'رجوع',
  'header.moreAria': 'خيارات إضافية',
  'nav.ariaLabel': 'تنقل الضيف',
  'nav.vehicle': 'السيارة',
  'nav.payment': 'الدفع (معاينة)',
  'nav.help': 'المساعدة (معاينة)',

  // More Menu
  'menu.title': 'خيارات إضافية',
  'menu.languageLabel': 'English',
  'menu.languageSub': 'Switch to English',
  'menu.darkModeLabel': 'الوضع الداكن',
  'menu.darkModeSub': 'التبديل بين المظهر الفاتح والداكن',
  'menu.darkModeAria': 'تبديل الوضع الداكن',
  'menu.photosLabel': 'صور حالة السيارة',
  'menu.photosSub': 'معاينة صور استلام السيارة',
  'menu.privacyLabel': 'الخصوصية والشروط',
  'menu.privacySub': 'سياسات حماية البيانات',
  'menu.contactLabel': 'الاتصال بمكتب الاصطفاف',
  'menu.contactSub': 'التواصل المباشر مع المسؤول',

  // Vehicle
  'vehicle.yourVehicle': 'سيارتك',
  'vehicle.defaultMake': 'السيارة',
  'vehicle.detailsTitle': 'تفاصيل السيارة',
  'vehicle.make': 'الشركة المصنعة',
  'vehicle.model': 'الموديل',
  'vehicle.color': 'اللون',
  'vehicle.status': 'الحالة',
  'vehicle.unknown': 'غير محدد',
  'vehicle.notSpecified': 'غير محدد',
  'vehicle.viewDetails': 'تفاصيل السيارة',

  // Trust Strip
  'trust.title': 'تسليم آمن وموثق',
  'trust.sub': 'رمز تحقق لمرة واحدة عند الاستلام',

  // Journey
  'journey.requested': 'تم الطلب',
  'journey.onTheWay': 'جاري الإحضار',
  'journey.ready': 'جاهزة للاستلام',

  // Lifecycle States Presentation
  'states.CHECKING_IN': 'تسجيل الدخول',
  'states.AWAITING_PARKING': 'بانتظار الركن',
  'states.PARKING': 'جاري الركن',
  'states.PARKED': 'مركونة بأمان',
  'states.REQUESTED': 'تم طلب السيارة',
  'states.RETRIEVING': 'جاري الإحضار',
  'states.READY': 'جاهزة للاستلام',
  'states.HANDOFF_PENDING': 'جاهزة للتسليم',
  'states.COMPLETED': 'اكتملت الخدمة',

  // Received Screen
  'received.statusReceived': 'تم استلام السيارة',
  'received.statusParking': 'جاري ركن السيارة',
  'received.statusAwaiting': 'بانتظار الركن',
  'received.cardTitle': 'يجري إتمام إجراءات استلام سيارتك.',
  'received.cardSub': 'سنوافيك بالتحديث فور ركنها بأمان.',

  // Parked Screen
  'parked.badge': 'تم الاصطفاف بأمان',
  'parked.locationLabel': 'الموقع',
  'parked.locationValue': 'مواقف آمنة',
  'parked.statusLabel': 'الحالة',
  'parked.statusValue': 'مركونة بأمان',
  'parked.requestButton': 'طلب السيارة',

  // Confirm Request Overlay
  'confirmRequest.title': 'هل ترغب بطلب سيارتك؟',
  'confirmRequest.description':
    'سيتم إضافة طلبك إلى قائمة تجهيز السيارات. أبقِ هذه الصفحة مفتوحة لمتابعة أحدث حالة للسيارة.',
  'confirmRequest.queueLabel': 'قائمة طلبات الاسترجاع',
  'confirmRequest.queueStatus': 'بانتظار إسناد الطلب',
  'confirmRequest.confirmButton': 'طلب السيارة',
  'confirmRequest.cancelButton': 'ليس الآن',

  // Requested Screen
  'requested.badge': 'تم طلب السيارة',
  'requested.cardTitle': 'تم استلام طلبك بنجاح.',
  'requested.cardSub': 'طلبك قيد الانتظار للتجهيز',
  'requested.cancelButton': 'إلغاء الطلب',
  'requested.cancelling': 'جاري إلغاء الطلب...',

  // On the way Screen
  'onTheWay.badge': 'السيارة في الطريق',
  'onTheWay.cardTitle': 'يجري إحضار سيارتك الآن.',
  'onTheWay.cardSub': 'مسؤول الخدمة متوجه لنقطة التسليم',

  // Ready Screen (Waiting)
  'ready.badge': 'جاهزة للاستلام',
  'ready.title': 'سيارتك {vehicle} جاهزة للاستلام.',
  'ready.cardTitle': 'مسؤول الخدمة يجهز عملية التسليم الآمن.',
  'ready.cardSub':
    'سيظهر رمز الاستلام أو رمز QR فور بدء موظف الخدمة بالتحقق.',

  // Verifying Screen
  'verifying.title': 'جاري التحقق من الاستلام',
  'verifying.subtitle': 'يرجى الانتظار حتى يكمل مسؤول الاصطفاف تسليم السيارة...',

  // Handoff PIN Screen
  'handoffPin.badge': 'جاهزة للاستلام',
  'handoffPin.title': 'سيارتك {vehicle} جاهزة للاستلام.',
  'handoffPin.instruction': 'أظهر هذا الرمز لمسؤول الاصطفاف',
  'handoffPin.pickupCodeLabel': 'رمز الاستلام',
  'handoffPin.showCodeSub': 'أظهر هذا الرمز لمسؤول الاصطفاف',
  'handoffPin.expiresIn': 'ينتهي خلال {time}',
  'handoffPin.expired': 'انتهت الصلاحية',
  'handoffPin.oneTime': 'تحقق لمرة واحدة · تنتهي الصلاحية بعد الاستخدام',
  'handoffPin.refreshButton': 'إنشاء رمز جديد',
  'handoffPin.refreshing': 'جاري التحديث...',
  'handoffPin.switchToQr': 'إظهار رمز QR بدلاً من ذلك',

  // Handoff QR Screen
  'handoffQr.badge': 'جاهزة للاستلام',
  'handoffQr.title': 'سيارتك {vehicle} جاهزة للاستلام.',
  'handoffQr.instruction': 'يقوم موظف الخدمة بمسح الرمز لتأكيد التسليم',
  'handoffQr.updatesEvery': 'يتجدد كل دقيقتين · ينتهي خلال {seconds} ثانية',
  'handoffQr.refreshButton': 'تحديث رمز QR',
  'handoffQr.refreshing': 'جاري التحديث...',
  'handoffQr.switchToPin': 'إظهار رمز الاستلام بدلاً من ذلك',
  'handoffQr.generationError': 'خطأ في إنشاء رمز QR',
  'handoffQr.ariaLabel': 'رمز الاستجابة السريعة الآمن والمتغير',

  // Completed Screen
  'completed.badge': 'اكتملت الخدمة',
  'completed.title': 'تم تسليم سيارتك {vehicle} بنجاح.',
  'completed.subtitle': 'اكتمل نقل عهدة السيارة. شكراً لاختياركم VAYLET.',
  'completed.cardTitle': 'تم استرجاع السيارة بأمان',
  'completed.cardSub': 'اكتملت خدمة الاصطفاف',
  'completed.devPreviews': 'معاينات التطوير (مراحل قادمة)',
  'completed.receiptPreview': 'معاينة الإيصال',
  'completed.ratingPreview': 'معاينة التقييم',

  // System & Error Screens
  'system.networkUnavailableTitle': 'الاتصال غير متاح',
  'system.networkUnavailableSub': 'انقطع الاتصال. تم حفظ حالة سيارتك الحالية.',
  'system.lastRecordedState': 'آخر حالة مسجلة: {state}',
  'system.expiredTitle': 'خدمة الاصطفاف غير متاحة',
  'system.expiredSub':
    'هذا الرابط غير صالح أو انتهت صلاحيته. يرجى فتح الرابط المرسل إلى هاتفك أثناء تسجيل الوصول.',
  'system.requestErrorTitle': 'تعذر إرسال الطلب',
  'system.requestErrorDefault': 'يرجى المحاولة مرة أخرى أو مراجعة مكتب خدمة الاصطفاف.',

  // API & Runtime Errors
  'errors.ANTI_ABUSE_UNAVAILABLE':
    'الخدمة غير متوفرة مؤقتاً. يرجى إعادة المحاولة بعد قليل.',
  'errors.GUEST_ACCESS_INVALID': 'رابط جلسة الاصطفاف غير صالح أو منتهي الصلاحية.',
  'errors.GUEST_ACCESS_RATE_LIMITED': 'طلبات متكررة. يرجى الانتظار قليلاً ثم إعادة المحاولة.',
  'errors.HANDOFF_VERIFICATION_FAILED':
    'فشل التحقق. يرجى مراجعة رمز الاستلام أو رمز QR.',
  'errors.HANDOFF_VERIFICATION_RATE_LIMITED':
    'محاولات تحقق متعددة. يرجى الانتظار قليلاً.',
  'errors.HANDOFF_VERIFICATION_NOT_ACTIVE': 'السيارة ليست جاهزة للتسليم حالياً.',
  'errors.INVALID_STATE_TRANSITION':
    'لا يمكن تنفيذ هذا الإجراء في حالة السيارة الحالية.',
  'errors.RETRIEVAL_REQUEST_NOT_READY':
    'طلب استرجاع السيارة غير متاح حالياً.',
  'errors.VERSION_CONFLICT': 'تغيرت حالة الجلسة. جاري تحديث بياناتك...',
  'errors.SERVICE_UNAVAILABLE':
    'الخدمة غير متاحة مؤقتاً. يرجى المحاولة بعد قليل.',
  'errors.REQUEST_FAILED': 'تعذر معالجة طلبك. يرجى إعادة المحاولة.',
  'errors.NETWORK_ERROR':
    'خطأ في الاتصال بالشبكة. يرجى التحقق من اتصال الإنترنت.',
  'errors.GENERIC_ERROR': 'حدث خطأ غير متوقع. يرجى إعادة المحاولة.',

  // Deferred Previews (Payment, Service)
  'payment.previewBanner':
    'معاينة فقط · مرحلة الدفع غير مرتبطة بعد بالنظام الفعلي.',
  'payment.overviewTitle': 'معاينة الدفع',
  'payment.serviceLabel': 'خدمة الاصطفاف',
  'payment.complimentary': 'مجانية',
  'payment.tipLabel': 'إكرامية',
  'payment.notAdded': 'لم تتم الإضافة',
  'payment.estimatedTotal': 'المجموع التقديري',
  'payment.previewAddTip': 'معاينة إضافة إكرامية',
  'payment.previewReceipt': 'معاينة الإيصال',
  'payment.addTipTitle': 'إضافة إكرامية (معاينة)',
  'payment.tipBanner': 'معاينة فقط · إعدادات الإكرامية مؤجلة إلى مرحلة المدفوعات.',
  'payment.receiptTitle': 'معاينة الإيصال',
  'payment.receiptBanner':
    'معاينة فقط · ستصدر الإيصالات من سجلات التسوية الخلفية.',
  'payment.service': 'الخدمة',
  'payment.standardValet': 'اصطفاف قياسي',
  'payment.status': 'الحالة',
  'payment.total': 'الإجمالي',

  'help.rateTitle': 'تقييم تجربتك (معاينة)',
  'help.rateBanner':
    'معاينة فقط · جمع التقييمات مؤجل إلى مرحلة بوابة العملاء.',
  'help.title': 'المساعدة والدعم',
  'help.valetDesk': 'مكتب الاصطفاف',
  'help.valetDeskValue': 'التحدث مع الموظفين في الموقع',
  'help.emergency': 'طوارئ',
  'help.emergencyValue': 'الاتصال باستقبال الفندق',
  'help.paymentInfo': 'معلومات الدفع (معاينة)',

  // Dev Demo Navigator
  'demo.navigatorTitle': 'متصفح معاينة التطوير',
  'demo.expand': 'توسيع',
  'demo.collapse': 'طي',
  'demo.live': '🟢 مباشر (النظام الفعلي)',
  'demo.received': '1. تم الاستلام',
  'demo.parked': '2. تم الاصطفاف',
  'demo.requested': '3. تم الطلب',
  'demo.onTheWay': '4. في الطريق',
  'demo.ready': '5. جاهزة (انتظار)',
  'demo.readyPin': '6. استلام بالرمز',
  'demo.readyQr': '7. استلام برمز QR',
  'demo.verifying': '8. جاري التحقق',
  'demo.completed': '9. اكتملت الخدمة',
  'demo.networkUnavailable': 'انقطاع الاتصال',
  'demo.expired': 'انتهت الصلاحية',
};
