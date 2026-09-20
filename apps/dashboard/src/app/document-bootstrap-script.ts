export const dashboardDocumentBootstrapScript = `
(function(){
  try {
    var locale = localStorage.getItem('vaylet_dashboard_locale');
    var resolvedLocale = locale === 'ar' ? 'ar' : 'en';
    document.documentElement.lang = resolvedLocale;
    document.documentElement.dir = resolvedLocale === 'ar' ? 'rtl' : 'ltr';
    var theme = localStorage.getItem('vaylet_dashboard_theme') === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
})();
`;
