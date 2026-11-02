export const en = {
  accountSecurity: "Account security",
  allLocations: "All Locations",
  arabic: "Arabic",
  backToWorkspace: "Back to workspace",
  chooseScope: "Choose your authorized workspace",
  changeScope: "Change scope",
  collapseNavigation: "Collapse sidebar",
  closeNavigation: "Close navigation",
  companyAdmin: "Company Admin",
  dark: "Dark",
  dashboardAccessUnavailable:
    "Management Dashboard access is unavailable for this authorized scope.",
  email: "Email",
  english: "English",
  expandNavigation: "Expand sidebar",
  help: "Help",
  helpBody: "Use your organization's approved support channel for assistance.",
  helpTitle: "Help and product guidance",
  loadError: "The authorized workspace could not be loaded safely.",
  loadMore: "Load more",
  loading: "Loading authorized scope…",
  language: "Language",
  light: "Light",
  location: "Location",
  locationManager: "Location Manager",
  locations: "Locations",
  login: "Sign in",
  loginFailed: "The Staff account could not be signed in.",
  loginIntro: "Use your VAYLET Staff account.",
  logout: "Sign out",
  logoutUnconfirmed:
    "Sign-out could not be confirmed. Protected access stays blocked until the server session is closed.",
  mfa: "Multi-factor authentication",
  mfaDisable: "Disable MFA",
  mfaDisableConfirm: "Confirm and disable MFA",
  mfaDisableImpact:
    "Disabling MFA removes the extra protection from your account. Enter a new code from your current authenticator to confirm. Features that require MFA will need setup and verification again.",
  mfaDisablePolicy:
    "Your account is required to use MFA. Disabling it is not available under the current policy.",
  mfaDisableBusy:
    "Account security is busy. Refresh the status and start a new confirmation to try again.",
  mfaDisableComplete:
    "MFA is not enabled. You can set up an authenticator again.",
  mfaDisableUncertain:
    "The request outcome could not be confirmed. Review the current server status. Any new attempt requires a new explicit confirmation.",

  mfaAssuredBody: "This session currently has server-verified MFA assurance.",
  mfaBeginEnrollment: "Set up authenticator",
  mfaBeginRecovery: "Use recovery code",
  mfaCancelCeremony: "Close this ceremony",
  mfaCompanyAdminPrompt: "Verify account security to use Company Admin scope.",
  mfaConfirmEnrollment: "Confirm authenticator",
  mfaContinueEnrollment: "Continue authenticator setup",
  mfaErrorAuthorization:
    "Account security is not available for this Staff session.",
  mfaErrorGeneric: "The account security request could not be completed.",
  mfaErrorInvalidResponse:
    "Account security received an invalid server response.",
  mfaErrorNetwork:
    "The network request could not be completed. Check your connection and try again.",
  mfaErrorRateLimited: "Too many verification attempts. Try again later.",
  mfaErrorSession: "Your Staff session changed. Sign in again if needed.",
  mfaErrorStateChanged:
    "The MFA state changed. Review the current status and continue from there.",
  mfaErrorStateRead: "The current MFA status could not be loaded safely.",
  mfaErrorUncertain:
    "The result could not be confirmed. The current server MFA status was checked before continuing.",
  mfaErrorVerification: "The verification code was not accepted.",
  mfaEnrollmentPendingBody:
    "An authenticator setup is already in progress. Continue to retrieve its current setup key.",
  mfaEnrollmentRequiredBody:
    "Protect your account with a TOTP authenticator. Set it up to use features that require MFA.",
  mfaIntro:
    "Manage the TOTP authenticator and one-time recovery codes for this Staff session.",
  mfaRecoveryBody:
    "If you cannot use your authenticator, enter one unused recovery code to start a replacement authenticator setup.",
  mfaRecoveryCode: "Recovery code",
  mfaRecoveryCodesBody:
    "Save all ten codes in a secure place. They will not be shown again after you close this disclosure.",
  mfaRecoveryCodesDone: "I saved these codes",
  mfaRecoveryCodesTitle: "Recovery codes",
  mfaRecoveryCodesWarning: "Each recovery code can be used only once.",
  mfaRecoveryTitle: "Recover authenticator access",
  mfaReissueBody:
    "Verify with your current authenticator to replace the existing recovery-code set.",
  mfaReissueRecoveryCodes: "Replace recovery codes",
  mfaSetupDetails: "VAYLET uses SHA-1 TOTP with 6 digits every 30 seconds.",
  mfaSetupInstructions:
    "Add a new account manually in your authenticator app using this server-issued setup key, then enter the current 6-digit code.",
  mfaSetupSecret: "Setup key",
  mfaSetupTitle: "Authenticator setup",
  mfaStatus: "MFA status",
  mfaStatusAssured: "Verified",
  mfaStatusChecking: "Checking server status…",
  mfaStatusEnrollmentPending: "Setup in progress",
  mfaStatusEnrollmentRequired: "MFA not enabled",
  mfaStatusStepUpRequired: "Verification required",
  mfaStatusUnavailable: "Account security unavailable",
  mfaStepUpBody:
    "Enter the current 6-digit code from your authenticator app to verify this session.",
  mfaTotpCode: "6-digit authenticator code",
  mfaVerify: "Verify",
  noEligibleScope:
    "No eligible Management workspace is available for this Staff session.",
  navigation: "Management navigation",
  inactiveHistorical: "Historical location",
  openNavigation: "Open navigation",
  organization: "Organization",
  password: "Password",
  refreshSession: "Retry session",
  retryLogout: "Retry sign out",
  retry: "Retry",
  security: "Security",
  securityIntro: "Manage authentication and account security.",
  selectLocation: "Select location",
  selectOrganization: "Select organization",
  supervisor: "Supervisor",
  theme: "Theme",
  unavailable: "The requested Management resource is not available.",
  workspace: "Workspace",
  workspaceReady:
    "Your authorized Management workspace is ready for feature modules.",
  workspaceTitle: "Authorized workspace",
} as const;

export type TranslationKey = keyof typeof en;
export type TranslationDictionary = Record<TranslationKey, string>;

export const ar: TranslationDictionary = {
  accountSecurity: "أمان الحساب",
  allLocations: "كل المواقع",
  arabic: "العربية",
  backToWorkspace: "العودة لمساحة العمل",
  chooseScope: "اختر مساحة العمل المصرح بها",
  changeScope: "تغيير النطاق",
  collapseNavigation: "طي الشريط الجانبي",
  closeNavigation: "إغلاق التنقل",
  companyAdmin: "مسؤول الشركة",
  dark: "داكن",
  dashboardAccessUnavailable:
    "الوصول إلى لوحة الإدارة غير متاح لهذا النطاق المصرح به.",
  email: "البريد الإلكتروني",
  english: "English",
  expandNavigation: "توسيع الشريط الجانبي",
  help: "المساعدة",
  helpBody: "استخدم قناة الدعم المعتمدة لدى مؤسستك للحصول على المساعدة.",
  helpTitle: "المساعدة وإرشادات المنتج",
  loadError: "تعذر تحميل مساحة العمل المصرح بها بأمان.",
  loadMore: "تحميل المزيد",
  loading: "جارٍ تحميل النطاق المصرح به…",
  language: "اللغة",
  light: "فاتح",
  location: "الموقع",
  locationManager: "مدير الموقع",
  locations: "المواقع",
  login: "تسجيل الدخول",
  loginFailed: "تعذر تسجيل الدخول بحساب الموظف.",
  loginIntro: "استخدم حساب موظفي VAYLET الخاص بك.",
  logout: "تسجيل الخروج",
  logoutUnconfirmed:
    "تعذر تأكيد تسجيل الخروج. سيبقى الوصول المحمي محظورًا حتى إغلاق الجلسة على الخادم.",
  mfa: "المصادقة متعددة العوامل",
  mfaDisable: "إيقاف المصادقة متعددة العوامل",
  mfaDisableConfirm: "تأكيد وإيقاف المصادقة متعددة العوامل",
  mfaDisableImpact:
    "يؤدي إيقاف المصادقة متعددة العوامل إلى إزالة الحماية الإضافية عن حسابك. أدخل رمزًا جديدًا من تطبيق المصادقة الحالي للتأكيد. ستتطلب الميزات المحمية إعداد المصادقة والتحقق مجددًا.",
  mfaDisablePolicy:
    "تتطلب سياسة حسابك استخدام المصادقة متعددة العوامل. لا يمكن إيقافها وفق السياسة الحالية.",
  mfaDisableBusy:
    "أمان الحساب مشغول. حدّث الحالة وابدأ تأكيدًا جديدًا للمحاولة مجددًا.",
  mfaDisableComplete:
    "المصادقة متعددة العوامل غير مفعلة. يمكنك إعداد تطبيق المصادقة مجددًا.",
  mfaDisableUncertain:
    "تعذر تأكيد نتيجة الطلب. راجع الحالة الحالية من الخادم. تتطلب أي محاولة جديدة تأكيدًا صريحًا جديدًا.",

  mfaAssuredBody: "هذه الجلسة تمتلك حاليًا تحقق MFA مؤكّدًا من الخادم.",
  mfaBeginEnrollment: "إعداد تطبيق المصادقة",
  mfaBeginRecovery: "استخدام رمز استرداد",
  mfaCancelCeremony: "إغلاق هذه العملية",
  mfaCompanyAdminPrompt: "تحقق من أمان الحساب لاستخدام نطاق مسؤول الشركة.",
  mfaConfirmEnrollment: "تأكيد تطبيق المصادقة",
  mfaContinueEnrollment: "متابعة إعداد تطبيق المصادقة",
  mfaErrorAuthorization: "أمان الحساب غير متاح لجلسة الموظف الحالية.",
  mfaErrorGeneric: "تعذر إكمال طلب أمان الحساب.",
  mfaErrorInvalidResponse: "استلم أمان الحساب استجابة غير صالحة من الخادم.",
  mfaErrorNetwork: "تعذر إكمال طلب الشبكة. تحقق من الاتصال وحاول مرة أخرى.",
  mfaErrorRateLimited: "محاولات التحقق كثيرة جدًا. حاول لاحقًا.",
  mfaErrorSession: "تغيّرت جلسة الموظف. سجّل الدخول مجددًا إذا لزم الأمر.",
  mfaErrorStateChanged: "تغيّرت حالة MFA. راجع الحالة الحالية وتابع منها.",
  mfaErrorStateRead: "تعذر تحميل حالة MFA الحالية بأمان.",
  mfaErrorUncertain:
    "تعذر تأكيد نتيجة العملية. تم التحقق من حالة MFA الحالية على الخادم قبل المتابعة.",
  mfaErrorVerification: "لم يتم قبول رمز التحقق.",
  mfaEnrollmentPendingBody:
    "إعداد تطبيق المصادقة جارٍ بالفعل. تابع لاسترجاع مفتاح الإعداد الحالي.",
  mfaEnrollmentRequiredBody:
    "احمِ حسابك بتطبيق TOTP للمصادقة، وأعدّه لاستخدام الميزات التي تتطلب المصادقة متعددة العوامل.",
  mfaIntro:
    "أدر تطبيق TOTP ورموز الاسترداد أحادية الاستخدام لجلسة الموظف الحالية.",
  mfaRecoveryBody:
    "إذا تعذر استخدام تطبيق المصادقة، أدخل رمز استرداد غير مستخدم لبدء إعداد تطبيق مصادقة بديل.",
  mfaRecoveryCode: "رمز الاسترداد",
  mfaRecoveryCodesBody:
    "احفظ الرموز العشرة كلها في مكان آمن. لن تظهر مرة أخرى بعد إغلاق هذا العرض.",
  mfaRecoveryCodesDone: "حفظت هذه الرموز",
  mfaRecoveryCodesTitle: "رموز الاسترداد",
  mfaRecoveryCodesWarning: "يمكن استخدام كل رمز استرداد مرة واحدة فقط.",
  mfaRecoveryTitle: "استرداد الوصول إلى تطبيق المصادقة",
  mfaReissueBody:
    "تحقق باستخدام تطبيق المصادقة الحالي لاستبدال مجموعة رموز الاسترداد الموجودة.",
  mfaReissueRecoveryCodes: "استبدال رموز الاسترداد",
  mfaSetupDetails:
    "يستخدم VAYLET بروتوكول TOTP بخوارزمية SHA-1 ورمزًا من 6 أرقام كل 30 ثانية.",
  mfaSetupInstructions:
    "أضف حسابًا جديدًا يدويًا في تطبيق المصادقة باستخدام مفتاح الإعداد الصادر من الخادم، ثم أدخل الرمز الحالي المكوّن من 6 أرقام.",
  mfaSetupSecret: "مفتاح الإعداد",
  mfaSetupTitle: "إعداد تطبيق المصادقة",
  mfaStatus: "حالة MFA",
  mfaStatusAssured: "تم التحقق",
  mfaStatusChecking: "جارٍ التحقق من حالة الخادم…",
  mfaStatusEnrollmentPending: "الإعداد جارٍ",
  mfaStatusEnrollmentRequired: "المصادقة متعددة العوامل غير مفعلة",
  mfaStatusStepUpRequired: "التحقق مطلوب",
  mfaStatusUnavailable: "أمان الحساب غير متاح",
  mfaStepUpBody:
    "أدخل الرمز الحالي المكوّن من 6 أرقام من تطبيق المصادقة للتحقق من هذه الجلسة.",
  mfaTotpCode: "رمز تطبيق المصادقة المكوّن من 6 أرقام",
  mfaVerify: "تحقق",
  noEligibleScope: "لا توجد مساحة إدارة متاحة ومصرح بها لجلسة الموظف الحالية.",
  navigation: "تنقل الإدارة",
  inactiveHistorical: "موقع تاريخي",
  openNavigation: "فتح التنقل",
  organization: "المؤسسة",
  password: "كلمة المرور",
  refreshSession: "إعادة محاولة الجلسة",
  retryLogout: "إعادة محاولة تسجيل الخروج",
  retry: "إعادة المحاولة",
  security: "الأمان",
  securityIntro: "أدر المصادقة وأمان الحساب.",
  selectLocation: "اختر الموقع",
  selectOrganization: "اختر المؤسسة",
  supervisor: "المشرف",
  theme: "المظهر",
  unavailable: "مورد الإدارة المطلوب غير متاح.",
  workspace: "مساحة العمل",
  workspaceReady: "مساحة الإدارة المصرح بها جاهزة لوحدات الميزات.",
  workspaceTitle: "مساحة العمل المصرح بها",
};
