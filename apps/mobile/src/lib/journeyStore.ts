import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useHarnesses, useModelJobs, useSessions } from "../data/queries";
import { useHub } from "../hub/HubContext";
import { buildJourney, type BuiltJourney, type ManualStep } from "./journey";

const KEY = "rivethub.journey";

interface Stored {
  done: ManualStep[];
  hidden: boolean;
}

const EMPTY: Stored = { done: [], hidden: false };
const MANUAL: readonly ManualStep[] = ["search", "summary", "review", "share"];
let cache: Stored = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();

function isManual(value: unknown): value is ManualStep {
  return typeof value === "string" && (MANUAL as readonly string[]).includes(value);
}

function read(): Stored {
  return cache;
}

function emit(next: Stored) {
  cache = next;
  listeners.forEach((listener) => listener());
  void AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {
    // the guide forgets on reload, which is harmless
  });
}

export function hydrateJourney(): Promise<void> {
  if (hydrated) return Promise.resolve();
  return AsyncStorage.getItem(KEY)
    .then((raw) => {
      if (hydrated) return;
      try {
        const parsed = JSON.parse(raw ?? "null") as Partial<Stored> | null;
        cache = { done: Array.isArray(parsed?.done) ? parsed.done.filter(isManual) : [], hidden: parsed?.hidden === true };
      } catch {
        cache = EMPTY;
      }
      hydrated = true;
      listeners.forEach((listener) => listener());
    })
    .catch(() => {
      hydrated = true;
    });
}

export function markStep(step: ManualStep) {
  if (cache.done.includes(step)) return;
  emit({ ...cache, done: [...cache.done, step] });
}

export function setGuideHidden(hidden: boolean) {
  if (cache.hidden === hidden) return;
  emit({ ...cache, hidden });
}

export function resetJourney() {
  cache = EMPTY;
  hydrated = false;
  void AsyncStorage.removeItem(KEY).catch(() => undefined);
  listeners.forEach((listener) => listener());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export interface Journey extends BuiltJourney {
  hidden: boolean;
  /** False until the hub has answered, so nothing flashes as "not done". */
  ready: boolean;
}

export function useJourney(): Journey {
  const stored = useSyncExternalStore(subscribe, read, () => EMPTY);
  const [storeReady, setStoreReady] = useState(hydrated);
  useEffect(() => {
    void hydrateJourney().then(() => setStoreReady(true));
  }, []);
  const harnesses = useHarnesses();
  const jobs = useModelJobs();
  const listed = useSessions({ view: "all" });
  const { pins } = useHub();
  const built = buildJourney({
    sessions: listed.data?.items.length ?? 0,
    capturing: harnesses.data?.some((harness) => harness.capture.state === "receiving") ?? false,
    recalling: harnesses.data?.some((harness) => harness.recall.state !== "not-connected") ?? false,
    hasModel: jobs.data?.some((job) => job.role !== "embedder" && !!job.model && job.health !== "failing") ?? false,
    pins: pins.length,
    done: stored.done,
  });
  return {
    ...built,
    hidden: stored.hidden,
    ready: storeReady && !harnesses.isPending && !jobs.isPending && !listed.isPending,
  };
}
