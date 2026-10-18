import type { ProviderAdapter, ProviderId } from './adapter.js';
import { discordAdapter } from './discord/adapter.js';
import { emailAdapter, googleAdapter } from './google/adapter.js';
import { stripeAdapter } from './stripe/adapter.js';

const adapters: ProviderAdapter[] = [stripeAdapter, discordAdapter, googleAdapter, emailAdapter];

export const listAdapters = () => adapters;
export const getAdapter = (id: string): ProviderAdapter | undefined => adapters.find((a) => a.id === (id as ProviderId));
