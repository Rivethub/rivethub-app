import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createClient, createShareClient } from "@rivethub/client";
import { App } from "./app";
import { sessionAuth } from "./client/auth";
import { createSampleClient } from "./dev/sample-client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource-variable/source-serif-4/opsz.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";
import "./styles.css";
import { applyStoredTheme } from "./theme";

applyStoredTheme();

const sampleOnly = new URLSearchParams(window.location.search).has("sample");
const live = { baseUrl: window.location.origin, fetch: window.fetch.bind(window), auth: sessionAuth };
const client = sampleOnly ? createSampleClient({ latencyMs: 60 }) : { ...createClient(live), share: createShareClient(live) };

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App client={client} />
  </StrictMode>,
);
