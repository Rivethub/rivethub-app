export type SettingsSection = "connections" | "account" | "appearance" | "sharing" | "trust";

export type TabParams = {
  Today: undefined;
  Review: undefined;
  Library: undefined;
  Search: undefined;
};

export type RootParams = {
  Tabs: { screen?: keyof TabParams } | undefined;
  Topic: { id: string };
  Entity: { id: string };
  Session: { id: string };
  Settings: { section: SettingsSection };
  AddHub: undefined;
};
