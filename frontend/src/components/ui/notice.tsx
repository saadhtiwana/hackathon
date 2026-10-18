"use client";

import { ApiError, isApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";

export function Notice({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  if (!error) return null;
  if (!isApiError(error)) {
    return <p className="text-[13px] text-signal">Something went wrong.</p>;
  }
  if (error.status === 403) {
    return (
      <p className="text-[13px] text-signal" role="alert">
        You don&apos;t have permission to {error.hint?.toLowerCase() ?? "do that"}.
      </p>
    );
  }
  if (error.status === 409) {
    return (
      <p className="text-[13px]" role="alert">
        Someone else changed this. Reload to see their version.{" "}
        <button type="button" className="underline" onClick={() => window.location.reload()}>
          Reload
        </button>
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3" role="alert">
      <p className="text-[13px] text-signal">{error.message}</p>
      {error.status === 0 && onRetry ? (
        <Button size="sm" variant="quiet" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function fieldErrors(error: unknown) {
  return error instanceof ApiError ? error.fields : undefined;
}
