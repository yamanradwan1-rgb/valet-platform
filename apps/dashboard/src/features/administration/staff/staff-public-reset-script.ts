// Served as the very first executable bytes of the standalone reset document.
// Keeping this script outside Next's hydration pipeline guarantees that the
// fragment is removed before resources, analytics, or network calls can run.
export const staffPublicResetScript = String.raw`
(function () {
  'use strict';
  let fragment = window.location.hash;
  const hadQuery = window.location.search.length !== 0;
  let scrubbed = false;
  try {
    window.history.replaceState(null, '', window.location.pathname);
    scrubbed = window.location.hash === '';
  } catch (_) { /* Without fragment scrubbing, never redeem. */ }
  const match = /^#reset=(vspr1\.[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048])$/.exec(fragment);
  let resetToken = scrubbed && !hadQuery && match ? match[1] : null;
  fragment = '';
  window.addEventListener('hashchange', function () {
    // A same-document navigation can add a new fragment without reloading this
    // script. Invalidate the earlier token and never import another credential.
    resetToken = null;
    try { window.history.replaceState(null, '', window.location.pathname); }
    catch (_) { /* Keep redemption disabled even if navigation cannot be scrubbed. */ }
    const form = document.getElementById('reset-form');
    const missing = document.getElementById('reset-missing');
    const password = document.getElementById('reset-password');
    const confirmation = document.getElementById('reset-confirm');
    if (password) password.value = '';
    if (confirmation) confirmation.value = '';
    if (form) form.hidden = true;
    if (missing) missing.hidden = false;
  });

  const translations = {
    en: {
      title: 'Reset your VAYLET password', intro: 'Choose a new password for your existing account.',
      password: 'New password', confirmPassword: 'Confirm new password',
      policy: 'Use 15–128 characters with no line breaks.', submit: 'Reset password',
      missing: 'This link is invalid or unavailable. Request a new link from your company administrator.',
      mismatch: 'Passwords do not match.', invalid: 'Choose a password of 15–128 characters without line breaks.',
      failed: 'The link could not be used. Request a fresh link if it expired or has already been used.',
      unknown: 'The server did not confirm the result. Try signing in with your new password. If that fails, request a new link from your company administrator.',
      limited: 'Too many attempts. Please try again later.', busy: 'Resetting password…',
      done: 'Your password was changed. Sign in again with your new password.',
      signIn: 'Sign in', dark: 'Dark mode', light: 'Light mode'
    },
    ar: {
      title: 'إعادة تعيين كلمة مرور VAYLET', intro: 'اختر كلمة مرور جديدة لحسابك الحالي.',
      password: 'كلمة المرور الجديدة', confirmPassword: 'تأكيد كلمة المرور الجديدة',
      policy: 'استخدم من ١٥ إلى ١٢٨ حرفاً دون فواصل أسطر.', submit: 'إعادة تعيين كلمة المرور',
      missing: 'هذا الرابط غير صالح أو غير متاح. اطلب رابطاً جديداً من مدير شركتك.',
      mismatch: 'كلمتا المرور غير متطابقتين.', invalid: 'اختر كلمة مرور بين ١٥ و١٢٨ حرفاً دون فواصل أسطر.',
      failed: 'تعذر استخدام الرابط. اطلب رابطاً جديداً إذا انتهت صلاحيته أو استُخدم سابقاً.',
      unknown: 'لم يؤكد الخادم نتيجة الطلب. حاول تسجيل الدخول بكلمة المرور الجديدة. إذا لم تنجح، اطلب رابطاً جديداً من مدير شركتك.',
      limited: 'محاولات كثيرة. حاول مرة أخرى لاحقاً.', busy: 'جارٍ تغيير كلمة المرور…',
      done: 'تم تغيير كلمة المرور. سجّل الدخول مجدداً بكلمة المرور الجديدة.',
      signIn: 'تسجيل الدخول', dark: 'الوضع الداكن', light: 'الوضع الفاتح'
    }
  };
  document.addEventListener('DOMContentLoaded', function () {
    const root = document.documentElement;
    const form = document.getElementById('reset-form');
    const missing = document.getElementById('reset-missing');
    const complete = document.getElementById('reset-complete');
    const unknown = document.getElementById('reset-unknown');
    const feedback = document.getElementById('reset-feedback');
    const password = document.getElementById('reset-password');
    const confirmation = document.getElementById('reset-confirm');
    const submit = document.getElementById('reset-submit');
    const language = document.getElementById('reset-language');
    const theme = document.getElementById('reset-theme');
    let locale = navigator.language.toLowerCase().startsWith('ar') ? 'ar' : 'en';
    let dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    let busy = false;
    let retryUntil = 0;
    let completed = false;
    let unresolved = false;

    function translate() {
      const t = translations[locale];
      root.lang = locale;
      root.dir = locale === 'ar' ? 'rtl' : 'ltr';
      root.setAttribute('data-theme', dark ? 'dark' : 'light');
      document.title = t.title;
      document.querySelectorAll('[data-copy]').forEach(function (node) {
        node.textContent = t[node.getAttribute('data-copy')];
      });
      theme.textContent = dark ? t.light : t.dark;
      language.setAttribute('aria-label', locale === 'ar' ? 'Switch to English' : 'التبديل إلى العربية');
    }

    function message(text) {
      feedback.textContent = text;
    }

    function showState() {
      form.hidden = !resetToken || completed || unresolved;
      missing.hidden = Boolean(resetToken) || completed || unresolved;
      complete.hidden = !completed;
      unknown.hidden = !unresolved;
    }

    function showUnknownResult() {
      // The server may have committed before its response was lost.
      resetToken = null;
      unresolved = true;
      password.value = '';
      confirmation.value = '';
      message('');
      showState();
      document.getElementById('reset-unknown-sign-in').focus();
    }

    language.addEventListener('click', function () {
      locale = locale === 'en' ? 'ar' : 'en';
      translate();
      message('');
    });
    theme.addEventListener('click', function () {
      dark = !dark;
      translate();
    });

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (busy || !resetToken || completed || Date.now() < retryUntil) return;
      const t = translations[locale];
      const candidate = password.value;
      const codePoints = Array.from(candidate).length;
      if (codePoints < 15 || codePoints > 128 || /[\r\n]/.test(candidate)) {
        message(t.invalid);
        return;
      }
      if (candidate !== confirmation.value) {
        message(t.mismatch);
        return;
      }
      busy = true;
      submit.disabled = true;
      message(t.busy);
      try {
        const response = await fetch('/v1/staff/auth/password-resets/redeem', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ resetToken: resetToken, newPassword: candidate }),
          cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', mode: 'same-origin'
        });
        if (response.ok) {
          const payload = await response.json();
          if (payload && payload.outcome === 'PASSWORD_RESET_COMPLETE' && Object.keys(payload).length === 1) {
            resetToken = null;
            completed = true;
            password.value = '';
            confirmation.value = '';
            message('');
            showState();
            document.getElementById('reset-sign-in').focus();
            return;
          }
          showUnknownResult();
          return;
        }
        if (response.status === 429) {
          const seconds = Number(response.headers.get('Retry-After'));
          retryUntil = Date.now() + 1000 * (Number.isFinite(seconds) && seconds > 0 ? Math.min(900, seconds) : 60);
          message(t.limited);
        } else if (response.status === 408 || response.status >= 500) {
          showUnknownResult();
        } else {
          message(t.failed);
        }
      } catch (_) {
        // A lost response must never trigger an automatic second redemption.
        showUnknownResult();
      } finally {
        busy = false;
        submit.disabled = completed;
      }
    });
    translate();
    showState();
  }, { once: true });
})();`;
