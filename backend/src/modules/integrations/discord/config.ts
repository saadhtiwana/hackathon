import { loadConfig } from '../service.js';
import type { ProviderAdapter } from '../adapter.js';
import type { DiscordConfig } from './api.js';

export const discordConfig = async (ws: string) => (await loadConfig(ws, { dbProvider: 'discord' } as ProviderAdapter)) as DiscordConfig | null;
