# @rivethub/opencode-capture

An OpenCode plug-in that tells the local `rh` runtime when an OpenCode session finishes a turn, so the runtime can capture it.

One file serves both OpenCode lines. Its default export carries an entry point for each, and each line calls only its own:

- OpenCode 2.x calls `setup(ctx)`. The plug-in reads `ctx.event.subscribe` and acts on `session.execution.succeeded`, `session.execution.failed` and `session.execution.interrupted`.
- OpenCode 1.x, from 1.3.4, calls `server(input)` and ignores `setup`. The plug-in returns an `event` hook and acts on `session.idle`, which OpenCode publishes when a turn ends, whether it succeeded, failed or was interrupted.

OpenCode before 1.3.4 called every export as a function and cannot load this file.

On each finished turn the plug-in runs rh's hook command with `{session_id, hook_event_name: "session.idle", cwd}` on stdin, in a detached process, and returns at once. It never throws into OpenCode and never waits on rh.

Checked with real sessions, headless and interactive, on OpenCode 1.3.4, 1.19.5, 2.0.0, 2.2.5 and 2.3.0.

## Install

This file is a template. `rh` embeds a copy, fills in the hook command and writes the result to `~/.config/opencode/plugins/rivethub-capture.ts`:

```sh
rh harness connect opencode
```

To install this checkout's file instead of the embedded copy, name it in `RIVETHUB_OPENCODE_PLUGIN`:

```sh
RIVETHUB_OPENCODE_PLUGIN=/path/to/rivethub-app/integrations/opencode/src/capture.ts rh harness connect opencode --capture
```

The literal `'__COMMAND__'` in `src/capture.ts` is the placeholder rh replaces. Keep it exactly, quotes included.

## Remove

`rh harness disconnect opencode --capture` deletes the installed file.
