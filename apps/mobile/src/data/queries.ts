import type {
  EntityId,
  FactId,
  IsoTime,
  ReviewDecision,
  ReviewItemId,
  SessionId,
  SessionQuery,
  TopicId,
  Visibility,
} from "@rivethub/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { useHub } from "../hub/HubContext";

export function useNotice() {
  const { client } = useHub();
  return useSyncExternalStore(client.subscribe, client.getNotice, client.getNotice);
}

export function useToday() {
  const { client, seed } = useHub();
  return useQuery({
    queryKey: ["today", client.scope],
    queryFn: () => client.today(),
    placeholderData: () => client.peek("today", []) ?? seed.today,
  });
}

export function useReviewQueue() {
  const { client, seed } = useHub();
  return useQuery({
    queryKey: ["review", client.scope],
    queryFn: () => client.reviewQueue(),
    placeholderData: () => client.peek("reviewQueue", []) ?? seed.review,
  });
}

export function useTopicTree() {
  const { client, seed } = useHub();
  return useQuery({
    queryKey: ["topics", client.scope],
    queryFn: () => client.topicTree(),
    placeholderData: () => client.peek("topicTree", []) ?? seed.topics,
  });
}

export function useTopic(id: string) {
  const { client } = useHub();
  return useQuery({
    queryKey: ["topic", client.scope, id],
    queryFn: () => client.topic(id as TopicId),
  });
}

export function useEntities() {
  const { client, seed } = useHub();
  return useQuery({
    queryKey: ["entities", client.scope],
    queryFn: () => client.entities(),
    placeholderData: () => client.peek("entities", []) ?? seed.entities,
  });
}

export function useEntity(id: string, asOf?: IsoTime) {
  const { client } = useHub();
  return useQuery({
    queryKey: ["entity", client.scope, id, asOf ?? "now"],
    queryFn: () => (asOf ? client.entity(id as EntityId, asOf) : client.entity(id as EntityId)),
  });
}

export function useEntityChanges(id: string) {
  const { client } = useHub();
  return useQuery({
    queryKey: ["changes", client.scope, id],
    queryFn: () => client.changes({ subject: id as EntityId }),
  });
}

export function useSessions(query: SessionQuery) {
  const { client, seed } = useHub();
  return useQuery({
    queryKey: ["sessions", client.scope, query],
    queryFn: () => client.sessions(query),
    placeholderData: () => client.peek("sessions", [query]) ?? { items: seed.sessions },
  });
}

export function useSession(id: string) {
  const { client } = useHub();
  return useQuery({
    queryKey: ["session", client.scope, id],
    queryFn: () => client.session(id as SessionId),
  });
}

export function useTranscript(id: string) {
  const { client } = useHub();
  return useQuery({
    queryKey: ["transcript", client.scope, id],
    queryFn: () => client.transcript(id as SessionId),
  });
}

export function useSummaryTree(id: string) {
  const { client } = useHub();
  return useQuery({
    queryKey: ["summary", client.scope, id],
    queryFn: () => client.summaryTree(id as SessionId),
  });
}

export function useSearch(text: string) {
  const { client } = useHub();
  const query = text.trim();
  return useQuery({
    queryKey: ["search", client.scope, query],
    queryFn: () => client.search(query),
    enabled: query.length > 0,
  });
}

export function useHarnesses() {
  const { client } = useHub();
  return useQuery({ queryKey: ["harnesses", client.scope], queryFn: () => client.harnesses() });
}

export function useModelJobs() {
  const { client } = useHub();
  return useQuery({ queryKey: ["models", client.scope], queryFn: () => client.modelJobs() });
}

export function useAccount() {
  const { client } = useHub();
  return useQuery({ queryKey: ["account", client.scope], queryFn: () => client.account() });
}

function useWrite<A>(fn: (client: ReturnType<typeof useHub>["client"], arg: A) => Promise<unknown>) {
  const { client } = useHub();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (arg: A) => fn(client, arg),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

export const useDecide = () =>
  useWrite((client, arg: { id: ReviewItemId; decision: ReviewDecision }) => client.decide(arg.id, arg.decision));

export const useSetFact = () =>
  useWrite(
    (client, arg: { entity: EntityId; fact: { id?: FactId; key: string; value: string; pinned: boolean } }) =>
      client.setFact(arg.entity, arg.fact),
  );

export const usePlaceSession = () =>
  useWrite((client, arg: { session: SessionId; topic: TopicId | null }) => client.placeSession(arg.session, arg.topic));

export const useKeep = () => useWrite((client, arg: { id: SessionId; keep: boolean }) => client.keep(arg.id, arg.keep));

export const useTrash = () => useWrite((client, ids: SessionId[]) => client.trash(ids));

export const useRestore = () => useWrite((client, ids: SessionId[]) => client.restore(ids));

export const useSetVisibility = () =>
  useWrite((client, arg: { id: SessionId; visibility: Visibility }) => client.setVisibility(arg.id, arg.visibility));

export const useUpdateAccount = () =>
  useWrite((client, patch: Parameters<ReturnType<typeof useHub>["client"]["updateAccount"]>[0]) => client.updateAccount(patch));

export const useSignOut = () => useWrite((client, _: void) => client.signOut());

export const useDeleteAccount = () => useWrite((client, _: void) => client.deleteAccount());

export function useSignIn() {
  const { client } = useHub();
  return useMutation({ mutationFn: (email: string) => client.signIn(email) });
}

/** Polls while an email sign-in is waiting. Stops refreshing once the link is followed. */
export function usePollSignIn(active: boolean) {
  const { client } = useHub();
  const queries = useQueryClient();
  return useQuery({
    queryKey: ["sign-in", client.scope],
    queryFn: async () => {
      const progress = await client.pollSignIn();
      if (progress.status === "signed-in") await queries.invalidateQueries({ queryKey: ["account", client.scope] });
      return progress;
    },
    enabled: active,
    refetchInterval: active ? 3_000 : false,
    retry: false,
  });
}
