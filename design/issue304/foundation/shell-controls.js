(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const shell = $('.shell');
  const doc = document.documentElement;
  const announce = (message) => { $('[data-shell-announcement]').textContent = message; };
  const labels = {
    en: {
      organization: 'Organization', changeScope: 'Change scope', navigation: 'Management navigation',
      open: 'Open navigation', close: 'Close navigation', collapse: 'Collapse sidebar', expand: 'Expand sidebar',
      light: 'Light', dark: 'Dark', logout: 'Sign out', language: 'Language',
      select: 'Select location', preview: 'Design preview; product navigation is inactive.',
      logoutPreview: 'Sign out is unavailable in this static design preview.',
      orgPreview: 'Organization switching is unavailable in this static design preview.',
    },
    ar: {
      organization: 'المؤسسة', changeScope: 'تغيير النطاق', navigation: 'تنقل الإدارة',
      open: 'فتح التنقل', close: 'إغلاق التنقل', collapse: 'طي الشريط الجانبي', expand: 'توسيع الشريط الجانبي',
      light: 'فاتح', dark: 'داكن', logout: 'تسجيل الخروج', language: 'اللغة',
      select: 'اختر الموقع', preview: 'معاينة تصميم؛ التنقل في المنتج غير فعّال.',
      logoutPreview: 'تسجيل الخروج غير متاح في معاينة التصميم الثابتة.',
      orgPreview: 'تغيير المؤسسة غير متاح في معاينة التصميم الثابتة.',
    },
  };
  const locations = SHELL_LOCATION_FIXTURE; // Replaced by assemble.mjs at build time.
  let selectedLocation = 0;
  let collapse = false;
  let lastMenuFocus = null;
  const whiteWordmark = $('.sidebar .vaylet-logo-wordmark').src;
  const darkWordmark = $('[data-shell-mobile-wordmark]').src;
  const expandedIcon = SHELL_COLLAPSE_EXPANDED_ICON;
  const collapsedIcon = SHELL_COLLAPSE_COLLAPSED_ICON;
  function publishState() {
    const state = Object.freeze({ locale: doc.lang, theme: doc.dataset.theme, locationIndex: selectedLocation });
    window.VAYLET_304_SHELL_STATE = state;
    window.dispatchEvent(new CustomEvent('vaylet:shell-state', { detail: state }));
  }

  function renderLocationLabels() {
    $('[data-shell-location]').textContent = locations[selectedLocation].name[doc.lang];
    options.forEach((option, index) => {
      option.textContent = locations[index].name[doc.lang];
      option.setAttribute('aria-selected', String(selectedLocation === index));
    });
  }

  function applyLocale(locale) {
    doc.lang = locale;
    doc.dir = locale === 'ar' ? 'rtl' : 'ltr';
    $$('[data-en][data-ar]').forEach((element) => { element.textContent = element.dataset[locale]; });
    $('[data-shell-locale]').textContent = locale === 'en' ? 'AR' : 'EN';
    $('[data-shell-locale]').setAttribute('aria-label', labels[locale].language);
    $('[data-shell-org]').setAttribute('aria-label', `${labels[locale].organization}: VAYLET Demo Organization. ${labels[locale].changeScope}`);
    $('[data-shell-location-trigger]').setAttribute('aria-label', labels[locale].changeScope);
    $('[data-shell-location-list]').setAttribute('aria-label', labels[locale].select);
    $('[data-shell-menu-trigger]').setAttribute('aria-label', labels[locale].open);
    $('[data-shell-menu-close]').setAttribute('aria-label', labels[locale].close);
    $('[data-shell-dialog]').setAttribute('aria-label', labels[locale].navigation);
    $$('nav[aria-label]').forEach((nav) => nav.setAttribute('aria-label', labels[locale].navigation));
    $('[data-shell-collapse]').setAttribute('aria-label', labels[locale][collapse ? 'expand' : 'collapse']);
    $('[data-copy="collapse"]').textContent = labels[locale][collapse ? 'expand' : 'collapse'];
    $('[data-copy="light"]').textContent = labels[locale].light;
    $('[data-copy="dark"]').textContent = labels[locale].dark;
    $('[data-copy="logout"]').textContent = labels[locale].logout;
    $('.theme-segmented').setAttribute('aria-label', locale === 'en' ? 'Theme' : 'المظهر');
    renderLocationLabels();
    document.dispatchEvent(new CustomEvent('issue304:locale', { detail: { locale } }));
    publishState();
  }

  function applyTheme(theme) {
    doc.dataset.theme = theme;
    $$('[data-shell-theme]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.shellTheme === theme)));
    $('[data-shell-mobile-wordmark]').src = theme === 'light' ? darkWordmark : whiteWordmark;
    document.dispatchEvent(new CustomEvent('issue304:theme', { detail: { theme } }));
    publishState();
  }

  function toggleCollapse() {
    collapse = !collapse;
    shell.dataset.sidebarCollapsed = String(collapse);
    $('.sidebar').dataset.collapsed = String(collapse);
    const collapseButton = $('[data-shell-collapse]');
    const svg = collapseButton.querySelector('svg');
    if (svg) svg.outerHTML = collapse ? collapsedIcon : expandedIcon;
    applyLocale(doc.lang);
  }

  const locationTrigger = $('[data-shell-location-trigger]');
  const locationList = $('[data-shell-location-list]');
  const options = $$('[data-shell-location-option]');
  function closeLocation(restoreFocus = true) {
    locationList.hidden = true;
    locationTrigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) locationTrigger.focus();
  }
  function openLocation() {
    locationList.hidden = false;
    locationTrigger.setAttribute('aria-expanded', 'true');
    options[selectedLocation].focus();
  }
  locationTrigger.addEventListener('click', () => locationList.hidden ? openLocation() : closeLocation());
  locationTrigger.addEventListener('keydown', (event) => {
    if (locationList.hidden && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault(); openLocation();
    }
  });
  options.forEach((button, index) => {
    button.addEventListener('click', () => {
      selectedLocation = index;
      renderLocationLabels();
      closeLocation();
      document.dispatchEvent(new CustomEvent('issue304:location', { detail: { location: locations[index].name[doc.lang], index } }));
      publishState();
    });
    button.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); closeLocation(); return; }
      const next = event.key === 'ArrowDown' ? index + 1 : event.key === 'ArrowUp' ? index - 1 :
        event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : null;
      if (next !== null) { event.preventDefault(); options[(next + options.length) % options.length].focus(); }
    });
  });
  document.addEventListener('pointerdown', (event) => {
    if (!locationList.hidden && !event.target.closest('.shell-location-anchor')) closeLocation(false);
  });

  const dialogBackdrop = $('[data-shell-mobile-dialog]');
  const dialog = $('[data-shell-dialog]');
  const menuButton = $('[data-shell-menu-trigger]');
  const closeButton = $('[data-shell-menu-close]');
  function openMenu() {
    lastMenuFocus = document.activeElement;
    dialogBackdrop.hidden = false;
    menuButton.setAttribute('aria-expanded', 'true');
    closeButton.focus();
  }
  function closeMenu() {
    dialogBackdrop.hidden = true;
    menuButton.setAttribute('aria-expanded', 'false');
    (lastMenuFocus ?? menuButton).focus();
  }
  menuButton.addEventListener('click', openMenu);
  closeButton.addEventListener('click', closeMenu);
  dialogBackdrop.addEventListener('mousedown', (event) => { if (event.target === dialogBackdrop) closeMenu(); });
  document.addEventListener('keydown', (event) => {
    if (!dialogBackdrop.hidden) {
      if (event.key === 'Escape') { event.preventDefault(); closeMenu(); return; }
      if (event.key === 'Tab') {
        const nodes = [...dialog.querySelectorAll('a[href],button:not([disabled]),[tabindex="0"]')];
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    } else if (event.key === 'Escape' && !locationList.hidden) closeLocation();
  });
  window.addEventListener('resize', () => { if (!dialogBackdrop.hidden && window.innerWidth > 820) closeMenu(); });

  $('[data-shell-locale]').addEventListener('click', () => applyLocale(doc.lang === 'en' ? 'ar' : 'en'));
  $$('[data-shell-theme]').forEach((button) => button.addEventListener('click', () => applyTheme(button.dataset.shellTheme)));
  $('[data-shell-collapse]').addEventListener('click', toggleCollapse);
  $('[data-shell-logout]').addEventListener('click', () => announce(labels[doc.lang].logoutPreview));
  $('[data-shell-org]').addEventListener('click', () => announce(labels[doc.lang].orgPreview));
  $$('[data-shell-route]').forEach((link) => link.addEventListener('click', (event) => {
    event.preventDefault();
    if (!dialogBackdrop.hidden) closeMenu();
    announce(labels[doc.lang].preview);
  }));
  applyLocale(doc.lang);
  applyTheme(doc.dataset.theme || 'light');
  queueMicrotask(publishState);
})();
