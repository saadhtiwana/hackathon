export type ProviderId = 'stripe' | 'discord' | 'google_calendar';
export type DbProvider = 'stripe' | 'discord' | 'google';

export interface AdapterContext {
  workspaceId: string;
  actorId: string | null;
  config: Record<string, any> | null;
}

export interface ConnectResult {
  config: Record<string, unknown>;
  secretLast4: string | null;
}

export interface Limits {
  summary: string;
  can: string[];
  cannot: string[];
}

// Providers implement this and register in registry.ts; nothing outside the adapter knows a provider's API (Q14).
export interface ProviderAdapter {
  id: ProviderId;
  dbProvider: DbProvider;
  label: string;
  // Per-user OAuth providers connect each employee separately instead of storing a workspace secret.
  perUser?: boolean;
  connect(ctx: AdapterContext, input: unknown): Promise<ConnectResult>;
  test(ctx: AdapterContext): Promise<void>;
  disconnect(ctx: AdapterContext): Promise<void>;
  describeLimits(): Limits;
}
