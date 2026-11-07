import { NavigationContainer, DarkTheme, DefaultTheme } from "@react-navigation/native";
import { QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { queryClient } from "./src/data/queryClient";
import { HubProvider } from "./src/hub/HubContext";
import { navigationRef } from "./src/nav/ref";
import { Root } from "./src/nav/Root";
import { ThemeProvider, useTheme } from "./src/theme/Theme";

function Shell() {
  const { palette, scheme } = useTheme();
  const base = scheme === "light" ? DefaultTheme : DarkTheme;
  return (
    <>
      <StatusBar style={scheme === "light" ? "dark" : "light"} />
      <NavigationContainer
        ref={navigationRef}
        theme={{
          ...base,
          colors: {
            ...base.colors,
            background: palette.background,
            card: palette.card,
            text: palette.foreground,
            border: palette.border,
            primary: palette.primary,
            notification: palette.warning,
          },
        }}
      >
        <Root />
      </NavigationContainer>
    </>
  );
}

export function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <HubProvider>
            <Shell />
          </HubProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
