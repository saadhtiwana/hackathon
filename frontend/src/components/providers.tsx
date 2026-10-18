"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastProvider } from "@/components/ui/toast";
import { Realtime } from "@/components/realtime";
import { isApiError } from "@/lib/api";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: (count, error) => {
              if (isApiError(error) && (error.status === 401 || error.status === 403 || error.status === 404)) {
                return false;
              }
              return count < 1;
            },
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={250}>
        <ToastProvider>
          <Realtime />
          {children}
        </ToastProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
