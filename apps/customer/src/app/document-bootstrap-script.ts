export const documentBootstrapScript = `
(function(){
  try {
    // 1. Locale pre-hydration setup
    var l = localStorage.getItem('vaylet_guest_locale');
    if (l === 'ar') {
      document.documentElement.lang = 'ar';
      document.documentElement.dir = 'rtl';
      document.documentElement.classList.add('vaylet-persisted-ar');
    } else {
      document.documentElement.lang = 'en';
      document.documentElement.dir = 'ltr';
    }

    // 2. Theme pre-hydration setup
    var t = localStorage.getItem('vaylet_guest_theme');
    var isDark = t === 'dark';
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');

    var meta = document.getElementById('vaylet-theme-color') || document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', isDark ? '#07111F' : '#FAFAF8');
    }
  } catch (e) {}
})();
`;
