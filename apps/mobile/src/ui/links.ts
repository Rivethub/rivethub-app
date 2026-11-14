export type InAppTarget =
  | { kind: "external"; href: string }
  | { kind: "topic" | "entity" | "session"; id: string };

/** Where a hub Markdown link goes. Topic, entity and session paths stay in the app. */
export function inAppTarget(href: string): InAppTarget | null {
  if (/^https?:\/\//i.test(href)) return { kind: "external", href };
  const topic = /^\/topics\/([^/?#]+)/.exec(href);
  const entity = /^\/entities\/([^/?#]+)/.exec(href);
  const session = /^\/sessions\/([^/?#]+)/.exec(href);
  if (topic?.[1]) return { kind: "topic", id: decodeURIComponent(topic[1]) };
  if (entity?.[1]) return { kind: "entity", id: decodeURIComponent(entity[1]) };
  if (session?.[1]) return { kind: "session", id: decodeURIComponent(session[1]) };
  return null;
}
