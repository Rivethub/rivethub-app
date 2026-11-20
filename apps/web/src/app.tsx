import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, type RouterHistory } from "@tanstack/react-router";
import { useState } from "react";
import { MemoryClientProvider, type AppClient } from "./client/context";
import { EntityDragProvider } from "./components/entity-drag";
import { TopicDragProvider } from "./components/topic-drag";
import { makeRouter } from "./router";

export function App({ client, history }: { client: AppClient; history?: RouterHistory }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } } }));
  const [router] = useState(() => makeRouter(history));
  return (
    <MemoryClientProvider client={client}>
      <QueryClientProvider client={queryClient}>
        <TopicDragProvider>
          <EntityDragProvider>
            <RouterProvider router={router} />
          </EntityDragProvider>
        </TopicDragProvider>
      </QueryClientProvider>
    </MemoryClientProvider>
  );
}
