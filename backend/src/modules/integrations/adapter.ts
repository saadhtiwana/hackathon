export type ProviderId = 'stripe' | 'google_calendar' | 'email' | 'email_alerts' | 'discord';
export type DbProvider = 'stripe' | 'discord' | 'google' | 'gmail';

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
  // Providers connected through a Google consent screen instead of pasted credentials.
  oauthPurpose?: 'calendar' | 'mailbox';
  connect(ctx: AdapterContext, input: unknown): Promise<ConnectResult>;
  // Runs once the connection is saved (for example to start a long-lived listener).
  afterConnect?(ctx: AdapterContext, config: Record<string, unknown>): Promise<void>;
  test(ctx: AdapterContext): Promise<void>;
  disconnect(ctx: AdapterContext): Promise<void>;
  describeLimits(): Limits;
}
