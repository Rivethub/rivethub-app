import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../app";
import type { AppClient } from "../client/context";
import { createSampleClient } from "../dev/sample-client";
import { makeRouter } from "../router";

describe("memory deep links", () => {
  it("pins /sessions/<id> and /topics/<id> to those routes", async () => {
    for (const [path, routeId] of [
      ["/sessions/s-retention", "/sessions/$sessionId"],
      ["/topics/rh-08", "/topics/$topicId"],
    ] as const) {
      const router = makeRouter(createMemoryHistory({ initialEntries: [path] }));
      await router.load();
      expect(router.state.location.pathname, path).toBe(path);
      expect(router.state.matches.at(-1)?.routeId, path).toBe(routeId);
    }
  });

  it("stays on a memory item that was opened before the first-run redirect would send the browser to welcome", async () => {
    localStorage.removeItem("rivethub.welcomed");
    const base = createSampleClient();
    const client = {
      ...base,
      capabilities: async () => ({ ...(await base.capabilities()), account: "live" }),
      harnesses: async () => (await base.harnesses()).map((h) => ({ ...h, capture: { ...h.capture, state: "not-connected" as const } })),
    } as AppClient;
    const history = createMemoryHistory({ initialEntries: ["/sessions/s-retention"] });
    render(<App client={client} history={history} />);
    expect(await screen.findByRole("heading", { level: 1, name: /Retention to 14 days/ })).toBeInTheDocument();
    expect(history.location.pathname).toBe("/sessions/s-retention");
    expect(screen.queryByRole("heading", { name: "Welcome to RivetHub" })).not.toBeInTheDocument();
  });
});
