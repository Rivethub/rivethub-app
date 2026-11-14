import { count, whenLabel } from "@rivethub/client-runtime/format";
import { createUpkeepClient, HttpError, RouteMissingError } from "@rivethub/client";
import type { MemoryStats, WorkerId } from "@rivethub/contracts";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { HUB_TIMEOUT_MS } from "../data/phoneClient";
import { createHubFetch } from "../data/hubFetch";
import { useHub } from "../hub/HubContext";
import { openReview } from "../nav/go";
import type { RootParams } from "../nav/types";
import { useTheme } from "../theme/Theme";
import { BackButton, GhostButton, Loading, PrimaryButton, Screen } from "../ui/chrome";

type Props = NativeStackScreenProps<RootParams, "Stats">;

const workerName: Record<WorkerId, { name: string; does: string }> = {
  embedder: { name: "Embedder", does: "Makes messages findable by meaning." },
  summarizer: { name: "Summarizer", does: "Writes each session's summary." },
  categorizer: { name: "Categorizer", does: "Files sessions and suggests tags." },
  "wiki-builder": { name: "Wiki builder", does: "Writes topic and entity pages." },
};

function unavailable(error: unknown): boolean {
  return error instanceof RouteMissingError || (error instanceof HttpError && (error.status === 404 || error.status === 501));
}

export function StatsScreen({ navigation }: Props) {
  const { palette } = useTheme();
  const { current } = useHub();
  const track = useMemo(() => ({ dataTimeouts: 0, quickFailures: 0 }), []);
  const upkeep = useMemo(() => {
    if (!current) return null;
    return createUpkeepClient({ baseUrl: current.url, fetch: createHubFetch(current.token, track), timeoutMs: HUB_TIMEOUT_MS });
  }, [current, track]);
  const queries = useQueryClient();
  const scope = current?.id ?? "sample";
  const stats = useQuery({
    queryKey: ["upkeep", "stats", scope],
    queryFn: () => (upkeep ? upkeep.stats() : Promise.resolve(null)),
  });
  const flagged = useQuery({
    queryKey: ["upkeep", "flagged", scope],
    queryFn: () => (upkeep ? upkeep.flagged() : Promise.resolve([])),
    enabled: !!upkeep,
  });
  const retry = useMutation({
    mutationFn: (id: string) => {
      if (!upkeep) return Promise.reject(new Error("This hub does not report its stats to the app."));
      return upkeep.retry(id);
    },
    onSuccess: () => queries.invalidateQueries({ queryKey: ["upkeep"] }),
  });
  const dismiss = useMutation({
    mutationFn: (id: string) => {
      if (!upkeep) return Promise.reject(new Error("This hub does not report its stats to the app."));
      return upkeep.dismiss(id);
    },
    onSuccess: () => queries.invalidateQueries({ queryKey: ["upkeep"] }),
  });

  const missing = stats.isError && unavailable(stats.error);

  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "center", paddingRight: 16 }}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={{ color: palette.foreground, fontSize: 17, fontWeight: "600" }}>Stats</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 22, paddingBottom: 40 }}>
        <Text style={{ color: palette.muted, fontSize: 15, lineHeight: 22 }}>What is in memory, and whether the work of organizing it is keeping up.</Text>
        {stats.data === null || missing ? (
          <Text style={{ color: palette.muted, fontSize: 15, lineHeight: 22 }}>This hub does not report its stats to the app.</Text>
        ) : stats.isPending ? (
          <Loading label="Loading stats…" />
        ) : stats.isError ? (
          <View style={{ gap: 10 }}>
            <Text style={{ color: palette.error, fontSize: 15, lineHeight: 22 }}>The stats did not load. {stats.error instanceof Error ? stats.error.message : ""}</Text>
            <GhostButton label="Try again" onPress={() => void stats.refetch()} />
          </View>
        ) : (
          <>
            {stats.data.toTidy > 0 ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, borderRadius: 12, padding: 14 }}>
                <Text style={{ flex: 1, color: palette.foreground, fontSize: 15 }}>
                  {stats.data.toTidy} {stats.data.toTidy === 1 ? "change is" : "changes are"} waiting for you in Review.
                </Text>
                <Pressable accessibilityRole="button" onPress={openReview} style={{ minHeight: 44, justifyContent: "center" }}>
                  <Text style={{ color: palette.info, fontWeight: "600" }}>Open Review</Text>
                </Pressable>
              </View>
            ) : null}
            {(flagged.data ?? []).length > 0 ? (
              <Group title="Failed jobs" hint="Grouped by cause. Retry after fixing the cause, or dismiss to stop seeing it.">
                {(flagged.data ?? []).map((group) => (
                  <View key={group.id} style={{ gap: 10, borderWidth: 1, borderColor: palette.warning, backgroundColor: palette.card, borderRadius: 12, padding: 14 }}>
                    <Text style={{ color: palette.foreground, fontWeight: "600" }}>{group.count} × {group.task}</Text>
                    <Text style={{ color: palette.muted, fontSize: 13, lineHeight: 18 }}>{group.cause} · last {whenLabel(group.lastFailedAt)}</Text>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <PrimaryButton label="Retry" onPress={() => retry.mutate(group.id)} disabled={retry.isPending} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <GhostButton label="Dismiss" onPress={() => dismiss.mutate(group.id)} />
                      </View>
                    </View>
                  </View>
                ))}
              </Group>
            ) : null}
            <Body stats={stats.data} />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Body({ stats }: { stats: MemoryStats }) {
  const total = stats.searchable.embedded + stats.searchable.waiting + stats.searchable.failed;
  const filed = stats.filing.byCategorizer + stats.filing.byYou;
  return (
    <>
      <Group title="In memory">
        <Tiles>
          <Tile label="Sessions" value={count(stats.sessions)} />
          <Tile label="Messages" value={count(stats.messages)} note={`${count(stats.toolCalls)} tool calls`} />
          <Tile label="Summaries" value={count(stats.summaries)} />
          <Tile
            label="Findable by meaning"
            value={total ? `${count(stats.searchable.embedded)} of ${count(total)}` : "None yet"}
            note={
              stats.searchable.failed
                ? `${count(stats.searchable.failed)} failed · ${count(stats.searchable.waiting)} waiting`
                : stats.searchable.waiting
                  ? `${count(stats.searchable.waiting)} waiting`
                  : total
                    ? "All caught up"
                    : "Needs an embedding model. Word search works without one."
            }
            warn={stats.searchable.failed > 0}
          />
        </Tiles>
      </Group>
      <Group title="Filing" hint="Where sessions were put, and by whom.">
        <Tiles>
          <Tile label="Filed" value={count(filed)} note={`${count(stats.filing.byCategorizer)} by the categorizer · ${count(stats.filing.byYou)} by you`} />
          <Tile label="Not filed yet" value={count(stats.filing.notFiled)} note={stats.filing.notFiled ? "See them in Sessions, under Unfiled" : `${count(stats.filing.leftOut)} left out, such as test runs`} />
          <Tile label="Corrections" value={count(stats.filing.correctionsLastWeek)} note="by you, in the last week" />
        </Tiles>
      </Group>
      <Group title="Wiki">
        <Tiles>
          <Tile label="Topic pages" value={count(stats.wiki.topicPages)} />
          <Tile label="Entities" value={count(stats.wiki.entities)} note={stats.wiki.entityTypes.slice(0, 4).map((type) => `${type.count} ${type.name}`).join(" · ")} />
          <Tile label="Pages without a topic" value={count(stats.wiki.loosePages)} />
        </Tiles>
      </Group>
      <Group title="Workers" hint="The background jobs that keep memory organized.">
        <Tiles>
          {stats.workers.map((worker) => (
            <Tile
              key={worker.id}
              label={workerName[worker.id].name}
              value={worker.lastFinishedAt ? whenLabel(worker.lastFinishedAt) : "Not run yet"}
              note={worker.failing ? `${worker.failing} failing` : workerName[worker.id].does}
              warn={worker.failing > 0}
            />
          ))}
        </Tiles>
      </Group>
    </>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const { palette } = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: palette.foreground, fontSize: 15, fontWeight: "600" }}>
        {title}
        {hint ? <Text style={{ color: palette.muted, fontWeight: "400" }}> {hint}</Text> : null}
      </Text>
      {children}
    </View>
  );
}

function Tiles({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>{children}</View>;
}

function Tile({ label, value, note, warn }: { label: string; value: string; note?: string; warn?: boolean }) {
  const { palette } = useTheme();
  return (
    <View style={{ width: "47%", flexGrow: 1, gap: 4, borderRadius: 12, backgroundColor: palette.card, padding: 14 }}>
      <Text style={{ color: palette.muted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: warn ? palette.warning : palette.foreground, fontSize: 20, fontWeight: "500" }}>{value}</Text>
      {note ? <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 16 }}>{note}</Text> : null}
    </View>
  );
}
