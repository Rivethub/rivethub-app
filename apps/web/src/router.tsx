import { createRootRoute, createRoute, createRouter, Outlet, redirect, retainSearchParams, type RouterHistory } from "@tanstack/react-router";
import { PaletteProvider } from "./components/palette";
import { EmbedState } from "./lib/embed-state";
import { EntitiesIndex, EntityPage } from "./routes/entity";
import { GuidePage } from "./routes/guide";
import { ReceivePage } from "./routes/receive";
import { ReviewPage } from "./routes/review";
import { SearchPage } from "./routes/search";
import { SessionPage, SessionsIndex } from "./routes/session";
import { SharePage } from "./routes/share";
import { SharedPage } from "./routes/shared";
import { StatsPage } from "./routes/stats";
import { SettingsIndex, SettingsPage } from "./routes/settings";
import { TodayPage } from "./routes/today";
import { TopicPage, TopicsIndex } from "./routes/topic";
import { FirstRunGate, WelcomePage } from "./routes/welcome";

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : undefined);
function oneOf<T extends string>(v: unknown, options: readonly T[]): T | undefined {
  return options.find((o) => o === v);
}
/** Drops undefined keys so search objects satisfy exactOptionalPropertyTypes. */
function clean<T extends Record<string, unknown>>(o: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as { [K in keyof T]?: Exclude<T[K], undefined> };
}

export const ARTICLE_TABS = ["overview", "sessions", "history"] as const;
export const SETTINGS_SECTIONS = ["connections", "account", "sharing", "keys", "trust", "appearance", "server"] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

const rootRoute = createRootRoute({
  validateSearch: (s: Raw) => clean({ embed: s.embed === "1" || s.embed === 1 ? (1 as const) : undefined }),
  search: { middlewares: [retainSearchParams(["embed"])] },
  component: () => (
    <EmbedState>
      <PaletteProvider>
        <FirstRunGate />
        <Outlet />
      </PaletteProvider>
    </EmbedState>
  ),
});

const today = createRoute({ getParentRoute: () => rootRoute, path: "/", validateSearch: (s: Raw) => clean({ date: str(s.date) }), component: TodayPage });
const review = createRoute({ getParentRoute: () => rootRoute, path: "/review", validateSearch: (s: Raw) => clean({ item: str(s.item) }), component: ReviewPage });
const topics = createRoute({ getParentRoute: () => rootRoute, path: "/topics", component: TopicsIndex });
const topic = createRoute({
  getParentRoute: () => rootRoute,
  path: "/topics/$topicId",
  validateSearch: (s: Raw) => clean({ tab: oneOf(s.tab, ARTICLE_TABS) }),
  component: TopicPage,
});
const entities = createRoute({ getParentRoute: () => rootRoute, path: "/entities", component: EntitiesIndex });
const entity = createRoute({
  getParentRoute: () => rootRoute,
  path: "/entities/$entityId",
  validateSearch: (s: Raw) => clean({ tab: oneOf(s.tab, ARTICLE_TABS), asOf: str(s.asOf), addFact: s.addFact === 1 || s.addFact === "1" ? (1 as const) : undefined }),
  component: EntityPage,
});
const sessions = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sessions",
  validateSearch: (s: Raw) => clean({ view: oneOf(s.view, ["all", "unfiled", "kept", "trash"] as const) }),
  component: SessionsIndex,
});
const session = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sessions/$sessionId",
  validateSearch: (s: Raw) => clean({ tab: oneOf(s.tab, ["summary", "transcript"] as const), from: num(s.from), to: num(s.to), view: oneOf(s.view, ["all", "unfiled", "kept", "trash"] as const) }),
  component: SessionPage,
});
const search = createRoute({ getParentRoute: () => rootRoute, path: "/search", validateSearch: (s: Raw) => clean({ q: str(s.q), when: oneOf(s.when, ["today", "yesterday", "last_7d", "last_14d"] as const), where: oneOf(s.where, ["messages", "summaries"] as const), match: oneOf(s.match, ["words", "fuzzy", "meaning", "pattern"] as const) }), component: SearchPage });
const settingsIndex = createRoute({ getParentRoute: () => rootRoute, path: "/settings", component: SettingsIndex });
const settings = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings/$section",
  beforeLoad: ({ params }) => {
    if (!oneOf(params.section, SETTINGS_SECTIONS)) throw redirect({ to: "/settings/$section", params: { section: "connections" } });
  },
  component: SettingsPage,
});
const library = createRoute({ getParentRoute: () => rootRoute, path: "/library", beforeLoad: () => { throw redirect({ to: "/topics" }); } });
const share = createRoute({ getParentRoute: () => rootRoute, path: "/share", validateSearch: (s: Raw) => clean({ session: str(s.session) }), component: SharePage });
const receive = createRoute({ getParentRoute: () => rootRoute, path: "/receive", component: ReceivePage });
const shared = createRoute({ getParentRoute: () => rootRoute, path: "/shared", component: SharedPage });
const stats = createRoute({ getParentRoute: () => rootRoute, path: "/stats", component: StatsPage });
const guide = createRoute({ getParentRoute: () => rootRoute, path: "/guide", component: GuidePage });
const welcome = createRoute({ getParentRoute: () => rootRoute, path: "/welcome", component: WelcomePage });

const routeTree = rootRoute.addChildren([today, review, topics, topic, entities, entity, sessions, session, search, settingsIndex, settings, library, welcome, share, receive, shared, guide, stats]);

export function makeRouter(history?: RouterHistory) {
  return createRouter({ routeTree, defaultPreload: "intent", scrollRestoration: true, ...(history ? { history } : {}) });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof makeRouter>;
  }
}
