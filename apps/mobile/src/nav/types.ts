import type { NavigatorScreenParams } from "@react-navigation/native";

export type SettingsSection = "connections" | "account" | "appearance" | "sharing" | "trust";

export type LibrarySegment = "topics" | "entities" | "sessions";

export type TabParams = {
  Today: undefined;
  Review: undefined;
  Library: { segment?: LibrarySegment } | undefined;
  Search: undefined;
};

export type RootParams = {
  Tabs: NavigatorScreenParams<TabParams> | undefined;
  Topic: { id: string };
  Entity: { id: string };
  Session: { id: string };
  Settings: { section: SettingsSection };
  AddHub: undefined;
  Guide: undefined;
  Stats: undefined;
  Shared: undefined;
};
