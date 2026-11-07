import * as SecureStore from "expo-secure-store";
import type { Kv } from "./records";

export const secureKv: Kv = {
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value),
  remove: (key) => SecureStore.deleteItemAsync(key),
};
