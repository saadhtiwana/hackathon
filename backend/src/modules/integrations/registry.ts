import type { ProviderAdapter, ProviderId } from './adapter.js';
import { emailAdapter, emailAlertsAdapter, googleAdapter } from './google/adapter.js';
import { stripeAdapter } from './stripe/adapter.js';

// Discord's adapter code stays in ./discord but is not registered, so it does not appear anywhere in the product.
const adapters: ProviderAdapter[] = [stripeAdapter, emailAdapter, googleAdapter, emailAlertsAdapter];

export const listAdapters = () => adapters;
export const getAdapter = (id: string): ProviderAdapter | undefined => adapters.find((a) => a.id === (id as ProviderId));
