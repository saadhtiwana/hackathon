export type ApiErrorBody = {
  code: string;
  message: string;
  hint?: string;
  fields?: Record<string, string>;
};

export class ApiError extends Error {
  status: number;
  code: string;
  hint?: string;
  fields?: Record<string, string>;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code;
    this.hint = body.hint;
    this.fields = body.fields;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

type Options = {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
};

export async function apiFetch<T>(path: string, options: Options = {}): Promise<T> {
  const method = options.method ?? "GET";
  const headers = new Headers();
  if (options.body !== undefined) headers.set("Content-Type", "application/json");

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      credentials: "include",
      signal: options.signal,
    });
  } catch {
    throw new ApiError(0, {
      code: "network",
      message: "The server did not respond.",
      hint: "Check that the API is running, then try again.",
    });
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as { error?: ApiErrorBody }) : {};

  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload.error ?? {
        code: "request_failed",
        message: "The request failed.",
        hint: "Try again.",
      },
    );
  }

  return payload as T;
}
