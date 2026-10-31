export type Scenario = 'recorded' | 'empty' | 'single' | 'loading' | 'unavailable' | 'provider' | 'denied' | 'long' | 'partial' | 'sparse' | 'noisy' | 'short';
const en = {
  title: 'Route History', view: 'View Route', viewer: 'Recorded Route History',
  description: 'Review GPS observations recorded during this task.',
  historical: 'Historical recording', notLive: 'Recorded GPS observations · not live tracking',
  loading: 'Loading recorded route…', unavailable: 'Route unavailable',
  unavailableBody: 'The recorded route cannot be displayed. Its availability could not be confirmed.',
  empty: 'No recorded GPS points', emptyBody: 'There are no GPS observations to display for this recording.',
  denied: 'Route access unavailable', deniedBody: 'You do not have access to Route History in this context.',
  active: 'Available after the task and recording end.',
  activeBody: 'Route History does not show an ongoing recording.',
  provider: 'Map could not be loaded', providerBody: 'Try loading the map again. The task will remain unchanged.',
  retry: 'Retry', close: 'Close route viewer', samples: 'Recorded samples',
  start: 'First observation', end: 'Last observation', startPin: 'Start', endPin: 'End',
  selected: 'Selected observation', point: 'Sample', of: 'of',
  earlier: 'Previous sample', later: 'Next sample', inspect: 'Inspect recorded samples',
  onePoint: 'One observation only. No traveled path can be shown.',
  partial: 'Partial recording. The interruption is left unconnected.',
  straight: 'Lines connect observations in recorded order; the path between them is unknown.',
  demo: 'Synthetic demo', demoNote: 'Local coordinate map · synthetic GPS · no Google Maps connection',
  demoShort: 'Coordinate demo · no basemap', demoControls: 'Prototype controls', scenario: 'Demo scenario',
  readOnly: 'Read only', timezone: 'All times · Asia/Amman (UTC+03:00)',
  date: '31 Oct 2026', zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Fit recording',
  mapLabel: 'Recorded GPS coordinate map', north: 'North',
};
const ar: typeof en = {
  title: 'سجل المسار', view: 'عرض المسار', viewer: 'سجل المسار المسجّل',
  description: 'استعرض نقاط GPS التي سُجّلت أثناء هذه المهمة.',
  historical: 'تسجيل سابق', notLive: 'نقاط GPS مسجّلة · ليس تتبّعًا مباشرًا',
  loading: 'جارٍ تحميل المسار المسجّل…', unavailable: 'المسار غير متاح',
  unavailableBody: 'تعذّر عرض المسار المسجّل. لم نتمكّن من تأكيد توفّره.',
  empty: 'لا توجد نقاط GPS مسجّلة', emptyBody: 'لا توجد نقاط GPS لعرضها لهذا التسجيل.',
  denied: 'الوصول إلى سجل المسار غير متاح', deniedBody: 'ليس لديك صلاحية الوصول إلى سجل المسار في هذا السياق.',
  active: 'يتاح بعد انتهاء المهمة والتسجيل.',
  activeBody: 'لا يعرض سجل المسار تسجيلًا جاريًا.',
  provider: 'تعذّر تحميل الخريطة', providerBody: 'حاول تحميل الخريطة مجددًا. لن تتغيّر المهمة.',
  retry: 'إعادة المحاولة', close: 'إغلاق عارض المسار', samples: 'العيّنات المسجّلة',
  start: 'أول نقطة مسجّلة', end: 'آخر نقطة مسجّلة', startPin: 'البداية', endPin: 'النهاية',
  selected: 'النقطة المحدّدة', point: 'العيّنة', of: 'من',
  earlier: 'العيّنة السابقة', later: 'العيّنة التالية', inspect: 'استعراض العيّنات المسجّلة',
  onePoint: 'نقطة مسجّلة واحدة فقط. لا يمكن عرض مسار حركة.',
  partial: 'تسجيل جزئي. لم يتم وصل النقاط عبر فترة الانقطاع.',
  straight: 'تصل الخطوط بين النقاط بترتيب تسجيلها؛ المسار بينها غير معروف.',
  demo: 'بيانات تجريبية', demoNote: 'خريطة إحداثيات محلية · GPS تجريبي · دون اتصال بخرائط Google',
  demoShort: 'إحداثيات تجريبية · دون خريطة أساس', demoControls: 'أدوات النموذج التجريبي', scenario: 'الحالة التجريبية',
  readOnly: 'للعرض فقط', timezone: 'جميع الأوقات · عمّان (UTC+03:00)',
  date: '٣١ أكتوبر ٢٠٢٦', zoomIn: 'تكبير', zoomOut: 'تصغير', fit: 'عرض التسجيل كاملًا',
  mapLabel: 'خريطة إحداثيات GPS المسجّلة', north: 'الشمال',
};
export function routeCopy(locale: 'en' | 'ar') { return locale === 'ar' ? ar : en; }

export const scenarios: { value: Scenario; en: string; ar: string }[] = [
  { value: 'recorded', en: 'Completed · recorded route', ar: 'مكتملة · مسار مسجّل' },
  { value: 'empty', en: 'No recorded points', ar: 'دون نقاط مسجّلة' },
  { value: 'single', en: 'One recorded point', ar: 'نقطة واحدة' },
  { value: 'loading', en: 'Loading', ar: 'جارٍ التحميل' },
  { value: 'unavailable', en: 'Route unavailable', ar: 'المسار غير متاح' },
  { value: 'provider', en: 'Map failure · retry', ar: 'تعذّر تحميل الخريطة · أعد المحاولة' },
  { value: 'denied', en: 'Access denied', ar: 'الوصول مرفوض' },
  { value: 'long', en: 'Long recording · 2,000 points', ar: 'تسجيل طويل · ٢٠٠٠ نقطة' },
  { value: 'partial', en: 'Partial · recording interruption', ar: 'جزئي · انقطاع التسجيل' },
  { value: 'sparse', en: 'Sparse recording', ar: 'نقاط متباعدة' },
  { value: 'noisy', en: 'Noisy GPS observations', ar: 'نقاط GPS غير منتظمة' },
  { value: 'short', en: 'Short recording', ar: 'تسجيل قصير' },
];

export function sampleTime(value: string, locale: 'en' | 'ar') {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-JO' : 'en-GB', {
    timeZone: 'Asia/Amman', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(value));
}
