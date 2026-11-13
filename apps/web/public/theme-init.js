// Runs synchronously from <head> so the stored theme is applied before first paint.
// A same-origin file, because the hub's CSP (script-src 'self') blocks inline scripts.
try {
  var t = localStorage.getItem("rivethub.theme");
  if (t === "rivethub" || t === "rivethub-light" || t === "everforest" || t === "t3-dark" || t === "t3-light") document.documentElement.dataset.theme = t;
} catch (e) {}
