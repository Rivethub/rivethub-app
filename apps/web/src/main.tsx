import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { createSampleClient } from "./dev/sample-client";
import "./styles.css";
import { applyStoredTheme } from "./theme";

applyStoredTheme();

// Swapped for the live @rivethub/client at merge. Nothing else imports src/dev.
const client = createSampleClient({ latencyMs: 60 });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App client={client} />
  </StrictMode>,
);
