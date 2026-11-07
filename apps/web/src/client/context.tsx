import type { Change, CrashReport, IsoTime, MemoryClient, SubjectRef, TopicId } from "@rivethub/contracts";
import { createContext, useContext, type ReactNode } from "react";

/**
 * Methods this app uses that `MemoryClient` does not have yet. Each is
 * optional: a screen hides the feature when its method is missing, so the
 * app runs on a client that implements only the contract.
 */
export interface MemoryClientExtras {
  pins?(): Promise<SubjectRef[]>;
  setPinned?(ref: SubjectRef, pinned: boolean): Promise<void>;
  libraryCounts?(): Promise<{ topics: number; entities: number; sessions: number }>;
  topicHistory?(id: TopicId): Promise<Change[]>;
  lastCrashReport?(): Promise<{ report: CrashReport; sentAt: IsoTime } | null>;
  requestSignIn?(email: string): Promise<void>;
}

export type AppClient = MemoryClient & MemoryClientExtras;

const ClientContext = createContext<AppClient | null>(null);

export function MemoryClientProvider({ client, children }: { client: AppClient; children: ReactNode }) {
  return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>;
}

export function useClient(): AppClient {
  const client = useContext(ClientContext);
  if (!client) throw new Error("useClient needs a MemoryClientProvider above it");
  return client;
}
