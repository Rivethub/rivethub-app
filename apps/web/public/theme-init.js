// Runs synchronously from <head> so the theme is applied before first paint.
// A same-origin file, because the hub's CSP (script-src 'self') blocks inline scripts.
// A saved choice wins. With none, an embedding host's appearance picks the T3 theme before the modules load.
try {
  var themes = { rivethub: 1, "rivethub-light": 1, everforest: 1, "t3-dark": 1, "t3-light": 1 };
  var t = localStorage.getItem("rivethub.theme");
  if (themes[t]) {
    document.documentElement.dataset.theme = t;
  } else {
    var appearance = window.rivethub && window.rivethub.host && window.rivethub.host.appearance;
    var mode = appearance && typeof appearance.get === "function" ? appearance.get() : "";
    if (mode === "dark") document.documentElement.dataset.theme = "t3-dark";
    else if (mode === "light") document.documentElement.dataset.theme = "t3-light";
  }
} catch (e) {}
