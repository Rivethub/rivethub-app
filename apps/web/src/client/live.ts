import { createClient, createShareClient, createUpkeepClient, type ClientOptions } from "@rivethub/client";
import { browserPinMethods } from "../lib/pins";
import type { AppClient } from "./context";

/**
 * The client for a real hub. Pins are not an rh route, so they are kept in
 * this browser and attached here, where the live client is assembled.
 * Sample mode does not use this.
 */
export function createLiveClient(options: ClientOptions): AppClient {
  return { ...createClient(options), share: createShareClient(options), upkeep: createUpkeepClient(options), ...browserPinMethods() };
}
