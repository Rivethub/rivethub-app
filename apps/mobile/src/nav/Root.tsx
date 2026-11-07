import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useEffect } from "react";
import { BackHandler, View } from "react-native";
import { useHub } from "../hub/HubContext";
import { AddHubScreen } from "../screens/AddHubScreen";
import { EntityScreen } from "../screens/EntityScreen";
import { HubSheet } from "../screens/HubSheet";
import { LibraryScreen } from "../screens/LibraryScreen";
import { ReviewScreen } from "../screens/ReviewScreen";
import { SearchScreen } from "../screens/SearchScreen";
import { SessionScreen } from "../screens/SessionScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { TodayScreen } from "../screens/TodayScreen";
import { TopicScreen } from "../screens/TopicScreen";
import { useTheme } from "../theme/Theme";
import { TabBar } from "./TabBar";
import type { RootParams, TabParams } from "./types";

const Tabs = createBottomTabNavigator<TabParams>();
const Stack = createNativeStackNavigator<RootParams>();

function TabScreens() {
  const { palette } = useTheme();
  return (
    <Tabs.Navigator
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: palette.background } }}
    >
      <Tabs.Screen name="Today" component={TodayScreen} />
      <Tabs.Screen name="Review" component={ReviewScreen} />
      <Tabs.Screen name="Library" component={LibraryScreen} />
      <Tabs.Screen name="Search" component={SearchScreen} />
    </Tabs.Navigator>
  );
}

export function Root() {
  const { palette } = useTheme();
  const { open, setOpen } = useHub();

  useEffect(() => {
    if (!open) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setOpen(false);
      return true;
    });
    return () => subscription.remove();
  }, [open, setOpen]);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.background } }}>
        <Stack.Screen name="Tabs" component={TabScreens} />
        <Stack.Screen name="Topic" component={TopicScreen} />
        <Stack.Screen name="Entity" component={EntityScreen} />
        <Stack.Screen name="Session" component={SessionScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="AddHub" component={AddHubScreen} />
      </Stack.Navigator>
      {open ? <HubSheet /> : null}
    </View>
  );
}
