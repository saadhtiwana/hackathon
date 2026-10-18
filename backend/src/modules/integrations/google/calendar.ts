import { googleFetch, type TokenStore } from './tokens.js';

const CAL = 'https://www.googleapis.com/calendar/v3';

export async function freeBusy(store: TokenStore, from: Date, to: Date): Promise<Array<{ start: string; end: string }>> {
  const r = await googleFetch<{ calendars: { primary: { busy?: Array<{ start: string; end: string }>; errors?: unknown[] } } }>(store, `${CAL}/freeBusy`, {
    method: 'POST',
    body: { timeMin: from.toISOString(), timeMax: to.toISOString(), items: [{ id: 'primary' }] },
  });
  return r.calendars?.primary?.busy ?? [];
}

export interface EventInput {
  title: string;
  description: string;
  start: Date;
  end: Date;
  timeZone: string;
}

const body = (e: EventInput) => ({ summary: e.title, description: e.description, start: { dateTime: e.start.toISOString(), timeZone: e.timeZone }, end: { dateTime: e.end.toISOString(), timeZone: e.timeZone } });

export const createEvent = (store: TokenStore, e: EventInput) => googleFetch<{ id: string; htmlLink: string }>(store, `${CAL}/calendars/primary/events`, { method: 'POST', body: body(e) });
export const patchEvent = (store: TokenStore, id: string, e: Partial<EventInput> & { title?: string }) =>
  googleFetch(store, `${CAL}/calendars/primary/events/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: {
      ...(e.title ? { summary: e.title } : {}),
      ...(e.description !== undefined ? { description: e.description } : {}),
      ...(e.start && e.timeZone ? { start: { dateTime: e.start.toISOString(), timeZone: e.timeZone } } : {}),
      ...(e.end && e.timeZone ? { end: { dateTime: e.end.toISOString(), timeZone: e.timeZone } } : {}),
    },
  });
export const deleteEvent = (store: TokenStore, id: string) => googleFetch(store, `${CAL}/calendars/primary/events/${encodeURIComponent(id)}`, { method: 'DELETE' });
