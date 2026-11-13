# rivethub-app: where things stand

Read `README.md` first; it has the layout, the build commands and how sharing works. This file is the running state for whoever picks the work up next.

## Current state (2026-11-13)

Branch `redesign/memory-manager` redesigns `apps/web` (which `apps/desktop` shows) around viewing and managing memory. See "How the app is laid out" in the README for the result.

Checked for real against `rh` 0.8.3 on an empty standalone node: first launch, Today, the session list, a session's messages and summary states, search, creating a topic, filing a session, recording a decision, keep, and the refused rename. Sharing between hubs was not driven live; it is covered by unit tests and `apps/desktop/e2e/share.live.spec.ts`, which was updated for the new navigation but not run.

## Decisions

- **One sidebar everywhere.** The session list is the main column, not a second sidebar; the topic tree and entity kinds nest under their library row.
- **Summary first.** A session opens on its summary when it has one, the messages otherwise.
- **The look is the Rust desktop app's.** Palette from `rivethub-desktop/crates/model/src/palette.rs`, content on one rounded surface, sans type. Phil's call: of every earlier UI, that one was the closest.
- **The guide stores nothing on the hub.** Steps derive from hub state plus a few flags in `localStorage` (`rivethub.journey`).
- **Stats, topic creation and the stored-transcript fallback are client-side additions over existing `rh` routes.** No runtime change was needed.

## Not done

- `apps/mobile` has the new themes and gets the client fixes (stored transcripts, untitled sessions, search passages) for free, but not the new screens: Guide, Stats, Shared, the richer session list, search filters.
- Tag taxonomy, tidy batches as batches, wiki gaps and archive, trash candidates, per-session model calls and export have routes in `rh` and no screen yet.
- Asks for the runtime: a route that reads one session's stored messages by session id; a memory-level session title; a session filter by visibility (Shared lists from the first page of sessions only).

## Gotchas

- `rh` sends `degraded` on search as an object (`{reason, effect}`) when no embedding model is set. The wire schema accepts a flag, a string or that object.
- `/api/share/find` ids are conversation ids, not session ids, and it only searches by text. Sharing from a session seeds that search with the title (or gist, or first message) and matches on tool and start time.
- A throwaway `rh local` needs a short home path: its Unix socket path is refused when the home directory is deep.
- Three desktop e2e tests (rejected URL exit code, window bounds and single instance, failed install lock) fail on the rivet-claude box on `main` too, so they are about that machine, not this branch.
