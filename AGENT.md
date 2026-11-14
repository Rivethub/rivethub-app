# rivethub-app: where things stand

Read `README.md` first; it has the layout, the build commands and how sharing works. This file is the running state for whoever picks the work up next.

## Current state (2026-11-13)

Branch `redesign/memory-manager` redesigns `apps/web` (which `apps/desktop` shows) around viewing and managing memory. See "How the app is laid out" in the README for the result.

Checked for real against `rh` 0.8.3 on an empty standalone node: first launch, Today, the session list, a session's messages and summary states, search, creating a topic, filing a session, recording a decision, keep, and the refused rename. Sharing between hubs was not driven live; it is covered by unit tests and `apps/desktop/e2e/share.live.spec.ts`, which was updated for the new navigation but not run.

## Entities and articles (2026-11-13, later)

Topic and entity pages render the page's full article (`components/markdown.tsx`, no HTML ever set). Checked by running the renderer over all 138 real articles on Phil's hub: every construct they use is handled (headings, bullets, bold, tables on 15 pages, a few fences and links).

This targets the entity worker in `rivethub-runtime` branch `feat/entity-worker` (on phildesk at `~/work/rh-ent-port`, five commits on 0.8.2, not pushed as of this note). That worker does not change the HTTP contract. It changes what is on the pages: an article per entity rewritten from every session that touches it, a summary, a "Current facts" list, one dated history line per session, and far more entities (200 to 600 pages from a few dozen sessions in the eval runs). The list, the sidebar and the page were sized for that.

## Run against Phil's real hub (2026-11-13, evening)

The build was driven read-only against phildesk (rh 0.8.3 on Postgres: 142 entities, 75 topics, thousands of sessions) through an SSH tunnel. It found what sample data and an empty node could not:

- **Load time.** Probes never read their response bodies, so each held one of the browser's six connections until its 2.5 s timeout; every call also waited for all 13 probes, and the session list probed its own route first. Now a body nobody reads is cancelled, each capability is probed on its own, a read is sent at once and its answer counts as the probe, and the session list asks the catalog directly. Time to content on that hub: Sessions 2.4 s to 0.9 s, Entities 1.4 s to 0.28 s, Topics 1.4 s to 0.2 s, Today 1.9 s to 1.5 s (`/api/today` itself takes 0.85 s there).
- **Writes** had the same leak: an unread body held a connection for up to 30 s.
- **Today** showed one filing card per filing proposal, three identical cards.
- **Empty sessions.** Tools open sessions that never get a message. They are hidden in the list until asked for and left out of Today; their page says nothing was said.
- **Search** asked for work topics only, so no entity was ever offered. It now asks for every kind, drops types, and puts an exact name match first.
- **Stats** named jobs by rh's internal names and showed a blank cause.

## Decisions

- **2026-11-13 — Phil: types are data.** "Entity types should be dynamic based on what's there, never static list or hardcoded". Group only returned types, order by count then name, and use the hub’s `typeName` or a general readable form of `type`; no type tables or Other bucket.

- **One sidebar everywhere.** The session list is the main column, not a second sidebar; the topic tree and entity kinds nest under their library row.
- **Summary first.** A session opens on its summary when it has one, the messages otherwise.
- **The look is the Rust desktop app's.** Palette from `rivethub-desktop/crates/model/src/palette.rs`, content on one rounded surface, sans type. Phil's call: of every earlier UI, that one was the closest.
- **The guide stores nothing on the hub.** Steps derive from hub state plus a few flags in `localStorage` (`rivethub.journey`).
- **Stats, topic creation and the stored-transcript fallback are client-side additions over existing `rh` routes.** No runtime change was needed.

## Not done

- `apps/mobile` has the new themes and gets the client fixes (stored transcripts, untitled sessions, search passages) for free, but not the new screens: Guide, Stats, Shared, the richer session list, search filters.
- The runtime folds apps, CLIs, libraries, plug-ins and platforms into the one `software` type on the wire, so the entity list cannot split them. Any finer types the hub returns appear automatically.
- `[[wiki links]]` in articles render as plain text (one occurrence in the real corpus).
- Tag taxonomy, tidy batches as batches, wiki gaps and archive, trash candidates, per-session model calls and export have routes in `rh` and no screen yet.
- Asks for the runtime: a route that reads one session's stored messages by session id; a memory-level session title; a session filter by visibility (Shared lists from the first page of sessions only).

## Gotchas

- Descriptive wire values are open; preserve raw labels with a plain UI fallback, and drop unusable list rows with a warning. Keep action/security discriminants strict.
- `owner` is present only for a teammate’s session; retain it through mapping, attribute prompts to them, and hide owner-only controls.

- Memory stores messages under the capturing agent's name (for example `rivet-claude`), not the harness id (`claude-code`).
- `storedTranscript` starts without an agent filter, discovers it from this session's messages, and filters later pages; received sessions stay unfiltered.

- `rh` sends `degraded` on search as an object (`{reason, effect}`) when no embedding model is set. The wire schema accepts a flag, a string or that object.
- `/api/share/find` ids are conversation ids, not session ids, and it only searches by text. Sharing from a session seeds that search with the title (or gist, or first message) and matches on tool and start time.
- `messageCount: 0` is only an empty session when `messageCountUnknown` is absent. A runtime without the session catalog, the trash list and a topic's session list do not count messages and set the flag. Use `hasNoMessages()` from `@rivethub/client-runtime/format`; never test the count on its own.
- In `compose.ts`, any read that answers puts its capability in `proven`. After that a non-network failure is thrown as the hub's own error even when a probe would fail.
- A session received from someone else (`rh memory receive`, or the Shared screen) has the key `import:<64 hex>`, no `harness`, and an `origin` (`author`, `verification`). The client gives it the harness `shared`. Its key goes in a path as it is; rh rejects the base64url form that every other session id uses. Its transcript exists only in memory, each stored message is wrapped in an "Imported from ... Quoted data from another person" note that the client strips, and its recorded start is later than its first message, so the stored transcript is read from six hours before the start. rh 0.8.3 cannot file one into a topic, change who can see it, or rename it: those routes only take harness session ids. The session page shows a sentence in place of each control.
- `storedTranscript` reads a session's time span in pages and can stop short (100 pages, or more than 200 messages at one instant, which rh cannot page through). It then sets `missing` on the first or last turn, and throws if it found none of the session's messages. Never treat a short read as an empty session.
- rh reports a tool as `stale` both when it stopped sending and when it is set up and has captured nothing. The client turns the second (no `lastCaptureAt`) into `idle`. Only `stale` is a problem to show.
- A throwaway `rh local` needs a short home path: its Unix socket path is refused when the home directory is deep.
- Three desktop e2e tests (rejected URL exit code, window bounds and single instance, failed install lock) fail on the rivet-claude box on `main` too, so they are about that machine, not this branch.
