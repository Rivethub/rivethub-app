import { createContext, useContext, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { desktopBridge } from "./desktop";
import { decideEmbed } from "./embed";

const EmbedContext = createContext(false);

export function EmbedState({ children }: { children: ReactNode }) {
  const embed = useRouterState({ select: (s) => (s.location.search as { embed?: unknown }).embed });
  const embedded = decideEmbed({ host: desktopBridge()?.host !== undefined, embed });
  return <EmbedContext.Provider value={embedded}>{children}</EmbedContext.Provider>;
}

export function useEmbedded(): boolean {
  return useContext(EmbedContext);
}
