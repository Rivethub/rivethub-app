import { useSyncExternalStore } from "react";

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", onChange);
      return () => m.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
  );
}

/** Below 768px the app uses the phone layout. */
export const useIsPhone = () => useMedia("(max-width: 767.98px)");
export const useIsWide = () => useMedia("(min-width: 1024px)");
