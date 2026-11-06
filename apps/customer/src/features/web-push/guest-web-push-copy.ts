export type GuestWebPushLocale = 'en' | 'ar';

export const GUEST_WEB_PUSH_COPY = Object.freeze({
  en: Object.freeze({
    notificationTitle: 'Your vehicle is ready',
    notificationBody: 'Your vehicle has arrived at the pickup area.',
    permissionTitle: 'Vehicle-ready notifications',
    permissionBody: 'Allow notifications so we can alert you when your vehicle is ready.',
    enable: 'Enable notifications',
    notNow: 'Not now',
    unavailable: 'Notifications are off. Check your vehicle status here for updates.',
    blockedTitle: 'Notifications are blocked',
    blockedBody: 'Your browser is blocking notifications. Enable them in browser settings to receive vehicle-ready alerts. You can always check your vehicle status here.',
    incompleteTitle: "Notifications aren't fully enabled",
    incompleteBody: 'Vehicle-ready alerts are not fully set up. Tap Enable notifications to try again, or check your vehicle status here.',
    iosHomeScreenRequired: 'On iPhone, add this app to your Home Screen, open it there, then enable notifications.',
  }),
  ar: Object.freeze({
    notificationTitle: 'سيارتك جاهزة',
    notificationBody: 'وصلت مركبتك إلى منطقة الاستلام وهي جاهزة لك.',
    permissionTitle: 'إشعارات جاهزية المركبة',
    permissionBody: 'اسمح بالإشعارات لننبهك عندما تصبح مركبتك جاهزة.',
    enable: 'تفعيل الإشعارات',
    notNow: 'ليس الآن',
    unavailable: 'الإشعارات متوقفة. تحقّق من حالة مركبتك هنا لمعرفة التحديثات.',
    blockedTitle: 'الإشعارات محظورة',
    blockedBody: 'المتصفح حاجب الإشعارات. فعّلها من إعدادات المتصفح حتى تقدر تستقبل إشعار جاهزية سيارتك. وبتقدر دائمًا تتابع حالة سيارتك من هون.',
    incompleteTitle: 'تفعيل الإشعارات غير مكتمل',
    incompleteBody: 'إشعارات جاهزية سيارتك مش مفعّلة بالكامل. اضغط تفعيل الإشعارات للمحاولة مرة ثانية، أو تابع حالة سيارتك من هون.',
    iosHomeScreenRequired: 'على iPhone، أضف التطبيق إلى الشاشة الرئيسية وافتحه من هناك، ثم فعّل الإشعارات.',
  }),
} as const);

export function guestWebPushCopy(locale: GuestWebPushLocale) {
  return GUEST_WEB_PUSH_COPY[locale];
}
