// ds-base.js — injects the Broadsheet base stylesheet (tokens + buttons/nav/seg).
// Page-specific type, color and layout are set by index.html's own <style>,
// which overrides the CSS custom properties this stylesheet reads from.
(() => {
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = '_ds/broadsheet-1e60ea10-6273-4712-b1c6-328beb2ebe0e/styles.css';
  document.head.appendChild(l);
})();
