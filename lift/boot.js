// Runs first, before the page draws: start loading your theme's lettering straight away (the app
// remembers which one from last time), so the text doesn't jump when the fonts arrive later.
try {
  const href = localStorage.getItem('lift.fontHref');
  if (href && href.startsWith('https://fonts.googleapis.com/css2?')) {
    const link = document.createElement('link');
    link.id = 'skinFonts'; link.rel = 'stylesheet'; link.href = href;
    document.head.appendChild(link);
  }
} catch (e) { /* no storage: the fonts load when the theme is applied */ }
