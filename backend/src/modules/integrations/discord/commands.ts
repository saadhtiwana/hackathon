import { discordApi, type DiscordConfig } from './api.js';

// Guild commands appear instantly, unlike global ones.
const CUSTOMER_COMMANDS = [
  { name: 'enquire', type: 1, description: 'Ask the team about a property' },
  { name: 'stop', type: 1, description: 'Stop receiving messages from us' },
];
const STAFF_COMMANDS = [
  { name: 'link', type: 1, description: 'Link your Discord account to Relay alerts', options: [{ type: 3, name: 'code', description: 'The code shown in Relay', required: true }] },
];

export async function registerCommands(cfg: DiscordConfig) {
  await discordApi(cfg.botToken, 'PUT', `/applications/${cfg.appId}/guilds/${cfg.customerGuildId}/commands`, CUSTOMER_COMMANDS);
  await discordApi(cfg.botToken, 'PUT', `/applications/${cfg.appId}/guilds/${cfg.staffGuildId}/commands`, STAFF_COMMANDS);
  return { customer: CUSTOMER_COMMANDS.map((c) => c.name), staff: STAFF_COMMANDS.map((c) => c.name) };
}

export async function clearCommands(cfg: DiscordConfig) {
  await discordApi(cfg.botToken, 'PUT', `/applications/${cfg.appId}/guilds/${cfg.customerGuildId}/commands`, []);
  await discordApi(cfg.botToken, 'PUT', `/applications/${cfg.appId}/guilds/${cfg.staffGuildId}/commands`, []);
}
