# VAYLET — #318 + #317 + #312 IMPLEMENTATION REPORT

التاريخ: 2026-10-22 — التنفيذ محصور في Customer navigation وRating presentation.
لا deployment أو migration إنتاجي أو PR أو merge.

## 1. التنفيذ

- **#318:** حُذف `BottomNav` ونوع `CustomerTab` ومسارا Payment/Help القديمان
  من root. بقي preview navigator الموجود، مع Payment وRating وبقية previews.
  AppShell يحتفظ بنفس عناصر الإنتاج وخصائصها؛ كان BottomNav يعيد null أصلاً.
- **#317:** حُذفت GuestOnsiteHelp وScreenHelp وdemo-help ومسار post-visit Help
  والمفاتيح الخاصة بها فقط. بقيت مفاتيح Rating preview المستخدمة، وتحول Done
  في Rating preview إلى `demo-completed` الموجود.
- **#312:** أضيفت سياسة مستقلة بحالات unprompted/pending/opened/dismissed/
  submitted/invalidated، وربطها بالـclient والزيارة الحالية. يبدأ الدخول
  التلقائي فقط من COMPLETED موثوق وحديث بعد bootstrap كامل ودون خطأ أو
  تبديل سياق معلق. ثم يعيد GuestPostVisitScreen تنفيذ `loadSession` قبل
  تركيب **GuestLiveRating نفسه**.
- تؤخذ نتائج saved/conflict/unknown من منسق الإرسال الحالي لمنع الإلحاح
  اللاحق؛ مسار POST وبياناته وتسلسله ومعالجة الأخطاء الأصلية محفوظة.
- **لم يتغير حرف من** `guest-live-rating.tsx` أو `screen-completed.tsx` أو
  `overlay-more-menu.tsx`. لا تغييرات Dashboard/Native/Employee/shared UI أو
  global CSS أو tokens أو DB أو endpoints أو سياسات handoff/payment/retrieval.
- Photos وPrivacy وContact محفوظة. قرئت #316 وتعليقاتها الحديثة؛ لم يؤذن
  Phase B فيها ولم تُلمس ملفاتها أو prototypes/worktrees الخاصة بها.

### الملفات والنطاق

القائمة الحصرية الدقيقة: [changed-files.txt](changed-files.txt).

| الملفات/المجال | التتبّع |
| --- | --- |
| `app/guest-app-root.tsx` | #318 + #317 + #312 |
| `app/guest-post-visit-route.tsx`, `components/layout/app-shell.tsx`, حذف bottom-nav | #318 + #312 |
| حذف `features/help/guest-onsite-help.tsx`, تنظيف `deferred/screen-service.tsx` | #317 |
| `demo-registry.ts`, `demo-screen-renderer.tsx` | #317؛ إبقاء Payment/Rating |
| `features/post-visit/use-guest-post-visit.ts`, `guest-post-visit-screen.tsx` | #312 + إزالة Help |
| `features/rating/rating-presentation-policy.ts`, `guest-rating-submission.ts` | #312 |
| `lib/guest-presentation-context.ts`, أربعة أسطر في `auth/guest-auth-bootstrap.ts` | #312؛ namespace عرض جديد بعد exchange ناجح |
| Customer translation dictionaries/types | #317/#318؛ حذف مفاتيح غير مستخدمة فقط |
| Customer focused tests وتحديث اختباري Help/AppShell | الإثبات والأنواع بعد إزالة التنقل |
| `apps/api/test/customer-auto-rating.browser.integration.test.ts` | اختبار Browser متصل بـAPI/DB؛ لا backend production changes |
| `apps/customer/qa/issues-312-317-318/*`, DEC-106 وهذه الأدلة | QA، التشغيل القابل للتكرار، عقد Owner |

## 2. UI-FROZEN

بُني baseline من `27b22d13fdb450e1468822728028e046b76ff92c` قبل تعديل المصدر.
حُفظت اللقطات الأولى، ثم أعيد بناء SHA نفسه في checkout منفصل لتوحيد
توقيت الحركة. لا CSS overrides أو masks أو إخفاء عناصر أو pixel thresholds.

المصفوفة: 320/390/768/1440، EN/LTR وAR/RTL، Light/Dark، Chromium نفسه،
device scale=1، timezone=Asia/Amman، نفس fonts وHTTP fixtures.

الشاشات: Vehicle/PARKED، REQUESTED، RETRIEVING، READY، PIN، QR، COMPLETED،
Rating، Payment Summary، More، Unavailable، Network recovery.
Rating قبل التغيير مفتوحة بالزر الأصلي؛ بعد التغيير مفتوحة تلقائيًا.

التفاصيل الرقمية والنتيجة لكل حالة: [comparison.json](comparison.json).
الصور الكاملة قبل/بعد: [screenshots.zip](screenshots.zip).
الحزمة تشمل PNG وDOM/styles/boxes الخام؛ checksum في
[screenshots.sha256](screenshots.sha256)، وبيانات النسخة في [provenance.json](provenance.json).
صور مرجعية مباشرة: [Rating قبل](before-rating.png)، [Rating بعد](after-rating.png)،
[More قبل](before-more.png)، [More بعد](after-more.png).

في أول محاولة ظهرت فروق sampling في opacity/transform وبعض QR screenshots
مع التطابق البنيوي. عولجت أداة الالتقاط بتثبيت animation عند نهاية متطابقة
والتصوير دون تدخل animation ثانٍ من Playwright. الأدلة الأولى محفوظة محليًا؛
لا تُحتسب PASS. النتيجة النهائية تُستمد من comparison.json فقط.

200% يستخدم Chromium `chrome.tabs.setZoom(2)` في profile معزول، مع قياس
`devicePixelRatio=2` وCSS zoom=`1` وتقلص innerWidth للنصف. ليس CSS zoom.
تغطي لقطات zoom الشاشات الاثنتي عشرة في الأبعاد واللغات والثيمات الستة عشر.
هناك قص محتوى سابق في بعض العروض الضيقة عند 200%، ظاهر في baseline؛
لم يُغيّر التصميم لمعالجته. تطابق الصور ليس شهادة WCAG أو usability كاملة.

اختبارات الصور تستخدم **synthetic HTTP contract fixtures داخل build إنتاجي**.
إثبات الصلاحيات الحقيقي منفصل أدناه، ولا تُعامل fixtures كإثبات DB authority.

## 3. دورة Rating

| الحالة | السلوك المثبت |
| --- | --- |
| PARKED/READY/HANDOFF_PENDING → COMPLETED | محاولة دخول تلقائية واحدة ثم revalidation مستقل |
| Cold start لزيارة COMPLETED | يفتح الموجود بعد GET صحيح للزيارة نفسها |
| Refresh قبل dismissal | يعيد الدخول إذا بقي السياق مخولًا |
| Back | يعود إلى Completed ويمنع الإلحاح بعد refresh/poll/focus/visibility |
| Manual revisit | الزر الأصلي يعمل؛ Payment Summary يبقى متاحًا |
| saved أو conflict | يُحفظ قرار منع الدخول التلقائي؛ لا تغيير للسجل الخادمي |
| unknown | لا ادعاء success ولا retry تلقائي؛ يُمنع الإلحاح التلقائي |
| Expiry/missing/bootstrap/reconciliation failure | لا دخول تلقائي؛ revalidation يفشل مغلقًا |
| تبديل client/visit | إبطال binding/callbacks القديمة وفصل الزيارة الجديدة |

sessionStorage يحمل outcome وnonce عرض عشوائيًا وvisit ID ومؤشر السياق
العام فقط، دون bearer/cookie secret/PII أو مشتق من credential.
أول Browser Session قد لا يحمل marker؛ nonce العرض يغطي هذا الوضع.
Exchange ناجح جديد يغيّر namespace؛ SAME_VISIT لا يغير قرار Back.
Legacy bearer بلا Browser Session يستخدم ذاكرة المكوّن فقط؛ لا يمكن استعادة
صلاحية bearer المُزال من fragment بعد refresh. إذا منع المتصفح sessionStorage
يبقى suppression داخل الذاكرة، ولا يمكن ضمان استمراره بعد refresh.

لا يوجد API لقراءة rating محفوظ من browser جديد. قد يرى Guest حينها
existing conflict عند submit صريح؛ لا يجري اختراع دليل خادمي.

## 4. الاختبارات الفعلية

| الأمر/الفحص | النتيجة |
| --- | --- |
| `pnpm --filter @valet/customer test` | 390 PASS / 56 files |
| Customer `typecheck`, `lint`, `build` | PASS |
| `pnpm architecture:check` | PASS؛ warnings تاريخية فقط |
| `pnpm lint` | 11/11 tasks PASS |
| `pnpm typecheck` | 11/11 tasks PASS |
| `pnpm build` | 10/10 tasks PASS |
| Guest rating command/service/browser-transport focused tests | 9 PASS |
| Guest rating boundary/idempotency + Browser Session HTTP/lifecycle | 44 PASS على PostgreSQL 17 معزول |
| Guest rating concurrency | 4 PASS |
| Guest Browser context-switch races | 7 PASS عند التشغيل المنفرد |
| Production Chromium + real Nest/PostgreSQL | 1 PASS؛ live/cold/refresh/Back/manual/expiry/missing؛ صفر automatic rating POST |
| Development Chromium navigator | PASS؛ Payment preview وRating Done → Completed، دون Help/BottomNav أو page exceptions |
| Keyboard/accessible controls | existing mounted coverage + Browser Tab؛ لا عناصر تفاعلية جديدة |
| `git diff --check`, focused Prettier | PASS |

أمر PostgreSQL focused:

```text
pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/guest-rating-boundary.integration.test.ts test/guest-rating-idempotency.integration.test.ts test/guest-rating-concurrency.integration.test.ts test/guest-browser-session-http.integration.test.ts test/guest-browser-session-lifecycle.integration.test.ts
```

اختبار Browser الحقيقي opt-in مع production server على 3312 وproxy على 3311:

```text
CUSTOMER_RATING_BROWSER_QA=1
pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/customer-auto-rating.browser.integration.test.ts
```

السجلات الدقيقة: [logs](logs/). PostgreSQL مؤقت خاص بالمهمة على loopback
55483، مع migrations القائمة فقط. واجه تشغيل race suites معًا تعارضًا في
تجهيز global test role؛ أعيد suite المتأثر منفردًا فنجح 7/7. لا تعديل للمهاجرات.

### بوابات المستودع غير الخضراء

- `pnpm test` توقف قبل التشغيل بسبب الحاجز الآمن لـIssue #215: لا verified
  task-owned disposable container. لم يُعطل الحاجز.
- `pnpm test:non-postgres`: خمسة failures في ملفات #300 الخاصة بإثباتات
  signed files/symlinks، وfailure واحد في `issue304-migration-source-appendix`.
  **أعيدت هذه الاختبارات على SHA baseline النظيف وفشلت بالطريقة نفسها.**
- لا CI أو human review أو merge acceptance مثبتة. نجاح local build لا
  يحوّل هذه البوابات إلى PASS، ولا تُعد هذه التسليمات release signoff.

## 5. الأمن والمراجعة

لم تتغير سياسة backend Rating أو DEC-064/091 أو نافذة 24 ساعة أو tenant/
Location scope أو شكل token. لا DB/API production diff ولا POST جديد.
Rating لا يُركّب قبل GET مستقل يثبت exact visit وCOMPLETED. المخزون المحلي
لا يمنح صلاحية، والردود القديمة محجوبة client/visit وAbortController.
تبقى mutations صريحة ومنفذها الخادمي الحالي هو صاحب صلاحيات الكتابة.

أجريت مراجعة diff باستخدام vaylet-code-review: scope، العقود، authority،
race/retry، الخصوصية، abstraction، architecture، الاختبارات والأدلة.
لا P0/P1 غير محلول في التغيير. ليست هذه مراجعة بشرية مستقلة أو Security Scan.
جميع الملفات الجديدة <=300 سطر؛ تقلص root بإزالة tab branches، دون تغيير
baseline المعماري أو dependencies أو lockfile.

## 6. Git

- Baseline: `27b22d13fdb450e1468822728028e046b76ff92c`؛ verified fetch من origin/main.
- Branch: `feat/customer-issues-312-317-318-ui-frozen`.
- Implementation commit: `eb7cb292db293ee356b8a4ca79c98eea696f49fe`.
- Remote: `https://github.com/yamanradwan1-rgb/valet-platform.git`.
- Worktree: `D:/kndoom/valet-platform/tmp/customer-312-317-318`.
- الأدلة أضيفت في commit منفصل؛ final HEAD والـremote SHA يردان في رسالة التسليم.
- ملفات المستخدم الثلاثة غير المتتبعة في checkout الرئيسي محفوظة، وmain لم يُعدل.

## 7. الحكم النهائي

الحكم الرقمي UI-FROZEN في comparison.json هو المرجع؛ لا تُحتسب المحاولات
الأولى الناقصة أو المختلف توقيتها.

**384/384 PASS:** اثنتا عشرة شاشة × أربعة عروض × لغتين/اتجاهين × ثيمين ×
100% و200% native. صفر بكسلات مختلفة، وتطابق HTML وcomputed styles وbounding
boxes في الحالات الـ384. الحزمة تحتوي 768 PNG مع snapshots الخام لكل حالة.

| البوابة | الحكم |
| --- | --- |
| #318 FUNCTIONAL | GO |
| #317 FUNCTIONAL | GO |
| #312 FUNCTIONAL | GO |
| CUSTOMER UI-FROZEN | GO للتطابق المثبت؛ قص 200% السابق موثق |
| SECURITY | GO للنطاق؛ دون ادعاء scan شامل أو deployment signoff |
| MERGE READINESS | NO-GO |

`MERGE READINESS NO-GO` حتى تصبح بوابات المستودع/CI ومراجعة Owner مستوفاة.
لا deployment أو merge أو إغلاق Issues ضمن هذا التسليم.

أعيد build Customer من implementation commit المثبت، ثم نجح اختبار
Nest/PostgreSQL/Chromium الحقيقي مجددًا وsmoke الصور عند 390px/EN/Light؛
بقيت نتيجة المقارنة الكلية 384/384. branch جاهز لمراجعة Owner، وليس إذن دمج.
