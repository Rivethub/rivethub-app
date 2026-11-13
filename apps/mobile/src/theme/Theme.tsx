import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { isTheme, PALETTES, type Palette, type ThemeId } from "./tokens";

const KEY = "rivethub.theme";

interface ThemeApi {
  id: ThemeId;
  palette: Palette;
  scheme: Palette["scheme"];
  setTheme: (id: ThemeId) => void;
}

const ThemeContext = createContext<ThemeApi | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<ThemeId>("rivethub");

  useEffect(() => {
    void AsyncStorage.getItem(KEY).then((stored) => {
      if (isTheme(stored)) setId(stored);
    });
  }, []);

  const api = useMemo<ThemeApi>(
    () => ({
      id,
      palette: PALETTES[id],
      scheme: PALETTES[id].scheme,
      setTheme: (next) => {
        setId(next);
        void AsyncStorage.setItem(KEY, next);
      },
    }),
    [id],
  );

  return <ThemeContext.Provider value={api}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeApi {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error("useTheme needs a ThemeProvider");
  return theme;
}
