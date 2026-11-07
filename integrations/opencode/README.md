# @rivethub/opencode-capture

An opencode plug-in that tells the local `rh` runtime when an opencode session finishes a turn, so the runtime can capture it.

On `session.execution.succeeded`, `session.execution.failed` and `session.execution.interrupted` it runs rh's hook command with `{session_id, hook_event_name: "session.idle", cwd}` on stdin. It never throws into opencode.

## Install

This file is a template. The runtime fills in the hook command and writes the result to `~/.config/opencode/plugins/rivethub-capture.ts`:

```sh
RIVETHUB_OPENCODE_PLUGIN=/path/to/rivethub/integrations/opencode/src/capture.ts rh harness connect opencode --capture
```

Without `RIVETHUB_OPENCODE_PLUGIN`, rh answers `422 opencode plug-in not available; build it from the rivethub repo`.

The literal `'__COMMAND__'` in `src/capture.ts` is the placeholder rh replaces. Keep it exactly, quotes included.

## Remove

`rh harness disconnect opencode --capture` deletes the installed file.
