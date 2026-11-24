import type { SubjectRef } from "@rivethub/contracts";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import { MemoryCache, type ResponseCache } from "../data/cache";
import { createPhoneClient, type PhoneClient } from "../data/phoneClient";
import { queryClient } from "../data/queryClient";
import { NO_HUB_NOTICE, Notices } from "../data/notices";
import type { RequestTrack } from "../data/hubFetch";
import { loadSeed, type Seed } from "../data/seed";
import { useTheme } from "../theme/Theme";
import { normalizeHubUrl, type PairPayload } from "./pair";
import { resolvePairDeepLink } from "./pendingPair";
import { togglePin } from "./pins";
import { hubIdFor, loadHubState, saveHubState, upsertHub, type HubRecord } from "./records";
import { secureKv } from "./secureKv";

const CACHE_KEY = "rivethub.response-cache.v1";
const PINS_KEY = "rivethub.pins";

interface HubApi {
  ready: boolean;
  hubs: HubRecord[];
  current: HubRecord | null;
  client: PhoneClient;
  seed: Seed;
  pins: SubjectRef[];
  open: boolean;
  pairError: string | null;
  pendingPair: PairPayload | null;
  setOpen: (open: boolean) => void;
  addHub: (input: { url: string; name: string; token?: string }) => Promise<void>;
  confirmPendingPair: () => Promise<void>;
  cancelPendingPair: () => void;
  selectHub: (id: string) => Promise<void>;
  removeHub: (id: string) => Promise<void>;
  togglePin: (ref: SubjectRef) => void;
}

const HubContext = createContext<HubApi | null>(null);

export function HubProvider({ children }: { children: ReactNode }) {
  const { palette } = useTheme();
  const notices = useMemo(() => new Notices(), []);
  const track = useMemo<RequestTrack>(() => ({ dataTimeouts: 0, quickFailures: 0 }), []);
  const memory = useMemo(() => new MemoryCache(), []);
  const cache = useMemo<ResponseCache>(
    () => ({
      peek: (key) => memory.peek(key),
      set: (key, value) => memory.set(key, value, (storageKey, payload) => AsyncStorage.setItem(storageKey, payload), CACHE_KEY),
    }),
    [memory],
  );
  const [ready, setReady] = useState(false);
  const [seed, setSeed] = useState<Seed | null>(null);
  const [hubs, setHubs] = useState<HubRecord[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);
  const [pendingPair, setPendingPair] = useState<PairPayload | null>(null);
  const [pins, setPins] = useState<SubjectRef[]>([]);
  const hubsRef = useRef(hubs);
  const currentRef = useRef(currentId);
  hubsRef.current = hubs;
  currentRef.current = currentId;

  useEffect(() => {
    let cancel = false;
    void (async () => {
      const [loaded, state, storedPins] = await Promise.all([loadSeed(), loadHubState(secureKv), AsyncStorage.getItem(PINS_KEY)]);
      await memory.hydrate((key) => AsyncStorage.getItem(key), CACHE_KEY);
      if (cancel) return;
      setSeed(loaded);
      setHubs(state.hubs);
      setCurrentId(state.currentId);
      setPins(parsePins(storedPins));
      if (!state.currentId) notices.setStanding(NO_HUB_NOTICE);
      setReady(true);
    })();
    return () => {
      cancel = true;
    };
  }, [memory, notices]);

  const current = hubs.find((hub) => hub.id === currentId) ?? null;
  const hubKey = current ? `${current.id}\n${current.url}\n${current.token ?? ""}` : "";
  const client = useMemo(() => createPhoneClient({ hub: current, cache, track, notices }), [hubKey, current, cache, track, notices]);

  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (!ready) return;
    if (seen.current === null) {
      seen.current = hubKey;
      return;
    }
    if (seen.current === hubKey) return;
    seen.current = hubKey;
    track.dataTimeouts = 0;
    track.quickFailures = 0;
    notices.clear();
    if (!current) notices.setStanding(NO_HUB_NOTICE);
    queryClient.removeQueries({ predicate: (query) => query.queryKey[1] !== client.scope });
  }, [ready, hubKey, current, client, notices, track]);

  const addHub = useCallback(
    async (input: { url: string; name: string; token?: string }) => {
      const url = normalizeHubUrl(input.url);
      if (!url) throw new Error("Enter a hub URL, like https://192.0.2.11:5174.");
      const name = input.name.trim();
      if (!name) throw new Error("Name the hub.");
      const record: HubRecord = { id: hubIdFor(url), name, url };
      if (input.token?.trim()) record.token = input.token.trim();
      const next = upsertHub(hubsRef.current, record);
      await saveHubState(secureKv, next, record.id);
      notices.clear();
      setHubs(next);
      setCurrentId(record.id);
      setPairError(null);
      setOpen(false);
    },
    [notices],
  );

  const selectHub = useCallback(
    async (id: string) => {
      if (!hubsRef.current.some((hub) => hub.id === id)) return;
      await saveHubState(secureKv, hubsRef.current, id);
      notices.clear();
      setCurrentId(id);
      setOpen(false);
    },
    [notices],
  );

  const removeHub = useCallback(
    async (id: string) => {
      const next = hubsRef.current.filter((hub) => hub.id !== id);
      const nextCurrent = currentRef.current === id ? (next[0]?.id ?? null) : currentRef.current;
      await saveHubState(secureKv, next, nextCurrent);
      notices.clear();
      if (!nextCurrent) notices.setStanding(NO_HUB_NOTICE);
      setHubs(next);
      setCurrentId(nextCurrent);
    },
    [notices],
  );

  const onTogglePin = useCallback((ref: SubjectRef) => {
    setPins((currentPins) => {
      const next = togglePin(currentPins, ref);
      void AsyncStorage.setItem(PINS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const cancelPendingPair = useCallback(() => {
    setPendingPair(null);
    setPairError(null);
  }, []);

  const confirmPendingPair = useCallback(async () => {
    if (!pendingPair) return;
    try {
      await addHub(pendingPair);
      setPendingPair(null);
    } catch (error: unknown) {
      setPairError(error instanceof Error ? error.message : "Could not save that hub.");
    }
  }, [addHub, pendingPair]);

  useEffect(() => {
    const apply = (url: string | null) => {
      const outcome = resolvePairDeepLink(url);
      if (!outcome) return;
      setPairError(outcome.pairError);
      setPendingPair(outcome.pendingPair);
      setOpen(outcome.open);
    };
    const subscription = Linking.addEventListener("url", ({ url }) => apply(url));
    void Linking.getInitialURL().then((url) => apply(url));
    return () => subscription.remove();
  }, []);

  const api = useMemo<HubApi | null>(() => {
    if (!seed) return null;
    return {
      ready,
      hubs,
      current,
      client,
      seed,
      pins,
      open,
      pairError,
      pendingPair,
      setOpen,
      addHub,
      confirmPendingPair,
      cancelPendingPair,
      selectHub,
      removeHub,
      togglePin: onTogglePin,
    };
  }, [ready, hubs, current, client, seed, pins, open, pairError, pendingPair, addHub, confirmPendingPair, cancelPendingPair, selectHub, removeHub, onTogglePin]);

  if (!api) return <View style={{ flex: 1, backgroundColor: palette.background }} />;
  return <HubContext.Provider value={api}>{children}</HubContext.Provider>;
}

export function useHub(): HubApi {
  const hub = useContext(HubContext);
  if (!hub) throw new Error("useHub needs a HubProvider");
  return hub;
}

function parsePins(raw: string | null): SubjectRef[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter(isSubject);
  } catch {
    return [];
  }
}

function isSubject(value: unknown): value is SubjectRef {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    (record["kind"] === "topic" || record["kind"] === "entity" || record["kind"] === "session") &&
    typeof record["id"] === "string" &&
    typeof record["title"] === "string"
  );
}
