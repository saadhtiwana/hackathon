"use client";

import { Notice } from "@/components/ui/notice";
import { isApiError } from "@/lib/api";

export function Problem({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <div className="mt-2">
      <Notice error={error} onRetry={onRetry} />
      {isApiError(error) && error.hint && error.status !== 409 && error.status !== 403 ? (
        <p className="mt-1 text-[13px] text-text-muted">{error.hint}</p>
      ) : null}
    </div>
  );
}
