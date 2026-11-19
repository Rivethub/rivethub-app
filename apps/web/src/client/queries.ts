import { keys, memoryWideKeys } from "@rivethub/client-runtime/query-keys";
import type {
  Capability,
  EntityId,
  EntityType,
  FactId,
  HarnessId,
  IsoTime,
  ReviewDecision,
  ReviewItem,
  ReviewItemId,
  TodayDigest,
  SearchOptions,
  SessionId,
  SessionQuery,
  SubjectRef,
  TopicId,
  Visibility,
} from "@rivethub/contracts";
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { withFreshLogin } from "./auth";
import { markStep } from "../lib/journey";
import { useClient, type AppClient } from "./context";

function q<T>(key: QueryKey, fn: (c: AppClient) => Promise<T>, enabled = true, live = false) {
  const client = useClient();
  return useQuery({
    queryKey: key,
    queryFn: () => fn(client),
    enabled,
    // Only Connections asks for this. Other screens keep the 30s cache and do not poll.
    ...(live ? { refetchInterval: 15_000, refetchOnWindowFocus: "always" as const } : {}),
  });
}

export const useCapabilities = () => q(keys.capabilities, (c) => c.capabilities());
export const useToday = (date?: string) => q(keys.today(date), (c) => c.today(date));
export const useReviewQueue = () => q(keys.review, (c) => c.reviewQueue());
export const useTopicTree = () => q(keys.topicTree, (c) => c.topicTree());
export const useTopic = (id: TopicId) => q(keys.topic(id), (c) => c.topic(id));
export const useEntities = (type?: EntityType) => q(keys.entities(type), (c) => c.entities(type));
export const useEntityTypes = () => q(keys.entityTypes, (c) => c.entityTypes?.() ?? Promise.resolve(null));
export const useEntity = (id: EntityId, asOf?: IsoTime) => q(keys.entity(id, asOf), (c) => c.entity(id, asOf));
export const useSessions = (query: SessionQuery) => q(keys.sessions(query), (c) => c.sessions(query));
export const useSession = (id: SessionId, enabled = true) => q(keys.session(id), (c) => c.session(id), enabled);
export const useTranscript = (id: SessionId, enabled = true) => q(keys.transcript(id), (c) => c.transcript(id), enabled);
export const useToolOutput = (id: SessionId, tool: string, enabled: boolean) => q([...keys.transcript(id), "tool", tool], (c) => c.toolOutput(id, tool), enabled);
export const useSummaryTree = (id: SessionId, enabled = true) => q(keys.summaryTree(id), (c) => c.summaryTree(id), enabled);
export const useSearch = (text: string, options: SearchOptions = {}) => q([...keys.search(text), options], (c) => c.search(text, options));
export const useHarnesses = (live = false) => q(keys.harnesses, (c) => c.harnesses(), true, live);
export const useModelJobs = (live = false) => q(keys.modelJobs, (c) => c.modelJobs(), true, live);
export const useHubs = () => q(keys.hubs, (c) => c.hubs());
export const useAccount = () => q(keys.account, (c) => c.account());

export const useChanges = (subject: TopicId | EntityId) => q(keys.changes(subject), (c) => c.changes({ subject }));

/** Extras resolve to `null` when the client does not implement them. */
export const usePins = () => q(keys.pins, (c) => (c.pins ? c.pins() : Promise.resolve(null)));
export const useLibraryCounts = () => q(keys.counts, (c) => (c.libraryCounts ? c.libraryCounts() : Promise.resolve(null)));
export const useLastCrashReport = () => q(keys.crash, (c) => (c.lastCrashReport ? c.lastCrashReport() : Promise.resolve(null)));

/** `null` when the client has no upkeep reads, so the Stats screen can say so. */
export const useMemoryStats = () => q(["upkeep", "stats"], (c) => (c.upkeep ? c.upkeep.stats() : Promise.resolve(null)));
export const useFlagged = () => q(["upkeep", "flagged"], (c) => (c.upkeep ? c.upkeep.flagged() : Promise.resolve([])));

export function useIsSample(cap: Capability): boolean {
  return useCapabilities().data?.[cap] === "sample";
}

/** A write followed by invalidating every query it can change. */
function useWrite<A, R>(fn: (c: AppClient, arg: A) => Promise<R>, invalidate: (arg: A) => QueryKey[]) {
  const client = useClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (arg: A) => fn(client, arg),
    onSettled: (_d, _e, arg) => Promise.all(invalidate(arg).map((queryKey) => qc.invalidateQueries({ queryKey }))),
  });
}

export const DECISION_FAILED = "That didn't go through, so it's back for you to try again.";

let decisionError: string | null = null;
const decisionErrorListeners = new Set<() => void>();

function setDecisionError(message: string | null) {
  decisionError = message;
  decisionErrorListeners.forEach((listener) => listener());
}

export function clearDecisionError() {
  setDecisionError(null);
}

/** Survives the card unmounting when the item leaves the list, so a failed decision can still be said. */
export function useDecisionError(): string | null {
  return useSyncExternalStore(
    (listener) => {
      decisionErrorListeners.add(listener);
      return () => decisionErrorListeners.delete(listener);
    },
    () => decisionError,
    () => null,
  );
}

const DECIDE = ["decide"] as const;

export function useDecide() {
  const client = useClient();
  const qc = useQueryClient();
  return useMutation({
    mutationKey: DECIDE,
    mutationFn: (a: { id: ReviewItemId; decision: ReviewDecision }) => {
      if (a.decision.kind !== "later") markStep("review");
      return client.decide(a.id, a.decision);
    },
    onMutate: async (a) => {
      setDecisionError(null);
      await qc.cancelQueries({ queryKey: keys.review });
      await qc.cancelQueries({ queryKey: ["today"] });
      const review = qc.getQueryData<ReviewItem[]>(keys.review);
      const todays = qc.getQueriesData<TodayDigest>({ queryKey: ["today"] });
      const reviewIndex = review?.findIndex((item) => item.id === a.id) ?? -1;
      const removed = (reviewIndex >= 0 ? review?.[reviewIndex] : undefined) ?? todays.map(([, digest]) => digest?.needsYou.find((item) => item.id === a.id)).find((item) => item !== undefined);
      if (review && reviewIndex >= 0) qc.setQueryData<ReviewItem[]>(keys.review, review.filter((item) => item.id !== a.id));
      const placements: { key: QueryKey; index: number }[] = [];
      for (const [key, digest] of todays) {
        const index = digest?.needsYou.findIndex((item) => item.id === a.id) ?? -1;
        if (!digest || index < 0) continue;
        placements.push({ key, index });
        qc.setQueryData<TodayDigest>(key, {
          ...digest,
          needsYou: digest.needsYou.filter((item) => item.id !== a.id),
          reviewCount: Math.max(0, digest.reviewCount - 1),
        });
      }
      return { removed, reviewIndex, placements };
    },
    onError: (_error, _a, ctx) => {
      const removed = ctx?.removed;
      if (removed) {
        if ((ctx?.reviewIndex ?? -1) >= 0) {
          qc.setQueryData<ReviewItem[]>(keys.review, (current) => {
            if (!current || current.some((item) => item.id === removed.id)) return current;
            const next = [...current];
            next.splice(Math.min(ctx!.reviewIndex, next.length), 0, removed);
            return next;
          });
        }
        for (const { key, index } of ctx?.placements ?? []) {
          qc.setQueryData<TodayDigest>(key, (digest) => {
            if (!digest || digest.needsYou.some((item) => item.id === removed.id)) return digest;
            const needsYou = [...digest.needsYou];
            needsYou.splice(Math.min(index, needsYou.length), 0, removed);
            return { ...digest, needsYou, reviewCount: digest.reviewCount + 1 };
          });
        }
      }
      setDecisionError(DECISION_FAILED);
    },
    onSuccess: () => setDecisionError(null),
    onSettled: () => {
      // A refetch while other decisions are still in flight would bring their items back. This one still
      // counts as in flight until the callback returns, so the check waits a tick; the last to settle refetches.
      setTimeout(() => {
        if (qc.isMutating({ mutationKey: DECIDE }) > 0) return;
        for (const queryKey of memoryWideKeys) void qc.invalidateQueries({ queryKey });
      }, 0);
    },
  });
}
export const useUpdateTopic = () =>
  useWrite(
    (c, a: { id: TopicId; patch: Parameters<AppClient["updateTopic"]>[1] }) => c.updateTopic(a.id, a.patch),
    // A move changes the path shown on sessions and Today as well.
    (a) => ("parentId" in a.patch ? memoryWideKeys : [keys.topicTree, ["topic"]]),
  );
export const useCreateTopic = () =>
  useWrite(
    (c, a: { name: string; parentId?: TopicId }) => (c.createTopic ? c.createTopic(a.name, a.parentId) : Promise.reject(new Error("This hub cannot create topics."))),
    () => [keys.topicTree, ["topic"]],
  );
export const useCreateEntityCategory = () =>
  useWrite(
    (c, name: string) => c.createEntityCategory!(name),
    () => [keys.entityTypes],
  );
export const useCreateEntity = () =>
  useWrite(
    (c, a: { name: string; categoryId: TopicId }) => c.createEntity!(a.name, a.categoryId),
    () => [keys.entityTypes, ["entities"], keys.counts, ["search"]],
  );
export const useAddDecision = () =>
  useWrite((c, a: { id: TopicId; text: string }) => c.addDecision(a.id, a.text), (a) => [keys.topic(a.id), keys.changes(a.id), ["today"]]);
export const usePlaceSession = () =>
  useWrite((c, a: { session: SessionId; topic: TopicId | null }) => c.placeSession(a.session, a.topic), () => memoryWideKeys);
export const useSetFact = () =>
  useWrite(
    (c, a: { entity: EntityId; fact: { id?: FactId; key: string; value: string; pinned: boolean } }) => c.setFact(a.entity, a.fact),
    (a) => [["entity", a.entity], keys.changes(a.entity), ["today"]],
  );
export const useRenameSession = () =>
  useWrite((c, a: { id: SessionId; title: string }) => c.renameSession(a.id, a.title), (a) => [keys.session(a.id), ["sessions"]]);
export const useSetVisibility = () =>
  useWrite((c, a: { id: SessionId; visibility: Visibility }) => c.setVisibility(a.id, a.visibility), (a) => [keys.session(a.id), ["sessions"]]);
export const useKeep = () =>
  useWrite((c, a: { id: SessionId; keep: boolean }) => c.keep(a.id, a.keep), (a) => [keys.session(a.id), ["sessions"]]);
export const useTrash = () => useWrite((c, ids: SessionId[]) => c.trash(ids), () => memoryWideKeys);
export const useRestore = () => useWrite((c, ids: SessionId[]) => c.restore(ids), () => memoryWideKeys);
export const useTag = () =>
  useWrite(
    (c, a: { id: SessionId; key: string; value: string; op: "add" | "remove" | "accept" | "reject" }) => c.tag(a.id, a.key, a.value, a.op),
    (a) => [keys.session(a.id)],
  );
export const useConnectHarness = () =>
  useWrite(
    (c, a: { id: HarnessId; part: "capture" | "recall"; dryRun?: boolean }) => c.connectHarness(a.id, a.part, a.dryRun ? { dryRun: true } : undefined),
    (a) => (a.dryRun ? [] : [keys.harnesses]),
  );
export const useUpdateAccount = () =>
  useWrite((c, patch: Parameters<AppClient["updateAccount"]>[0]) => c.updateAccount(patch), () => [keys.account]);
export const useSignOut = () => useWrite((c, _: void) => withFreshLogin(() => c.signOut()), () => [keys.account]);
export const useDeleteAccount = () => useWrite((c, _: void) => withFreshLogin(() => c.deleteAccount()), () => [keys.account]);
export const useSetPinned = () =>
  useWrite(
    (c, a: { ref: SubjectRef; pinned: boolean }) => (c.setPinned ? c.setPinned(a.ref, a.pinned) : Promise.resolve()),
    () => [keys.pins],
  );
export const useRetryFlagged = () => useWrite((c, id: string) => (c.upkeep ? c.upkeep.retry(id) : Promise.resolve()), () => [["upkeep"]]);
export const useDismissFlagged = () => useWrite((c, id: string) => (c.upkeep ? c.upkeep.dismiss(id) : Promise.resolve()), () => [["upkeep"]]);

export const useMe = () => q(["me"], (c) => c.me());
export const useTagOperations = () => q(["tag-operations"], (c) => c.tagOperations ? c.tagOperations() : Promise.resolve([]));
