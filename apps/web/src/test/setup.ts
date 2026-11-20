import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { reloadPins } from "../lib/pins";

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  delete (window as { rivethub?: unknown }).rivethub;
  reloadPins();
  document.documentElement.dataset.theme = "everforest";
});

/** jsdom has no layout. Tests run at a desktop width unless they set `window.__phone`. */
window.matchMedia = (query: string) => {
  const phone = (window as { __phone?: boolean }).__phone === true;
  const max = /max-width:\s*([\d.]+)px/.exec(query);
  const min = /min-width:\s*([\d.]+)px/.exec(query);
  const width = phone ? 390 : 1440;
  const matches = max ? width <= Number(max[1]) : min ? width >= Number(min[1]) : false;
  return { matches, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false } as MediaQueryList;
};
Element.prototype.scrollIntoView = function () {};
window.scrollTo = () => {};
