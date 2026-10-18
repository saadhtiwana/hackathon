import { googleFetch, type TokenStore } from './tokens.js';

const G = 'https://gmail.googleapis.com/gmail/v1/users/me';

export interface ParsedEmail {
  id: string;
  threadId: string;
  from: string; // lowercased address
  fromName: string;
  subject: string;
  text: string;
  messageIdHeader: string | null;
  at: Date;
  labels: string[];
}

const b64 = (s: string) => Buffer.from(s, 'base64url').toString('utf8');
const header = (h: Array<{ name: string; value: string }>, n: string) => h.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value ?? null;

function bodyOf(part: any): string {
  if (!part) return '';
  if (part.mimeType === 'text/plain' && part.body?.data) return b64(part.body.data);
  for (const p of part.parts ?? []) {
    const t = bodyOf(p);
    if (t) return t;
  }
  if (part.mimeType === 'text/html' && part.body?.data) return b64(part.body.data).replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  return '';
}

// Drops the quoted history of a reply so only the new text is stored.
function stripQuoted(t: string): string {
  const lines = t.replace(/\r/g, '').split('\n');
  const cut = lines.findIndex((l, i) => /^On .+ wrote:$/.test(l.trim()) || (/^>/.test(l) && i > 0) || /^-{2,}\s*Original Message/i.test(l));
  return (cut > 0 ? lines.slice(0, cut) : lines).join('\n').trim().slice(0, 4000);
}

export function parseFrom(raw: string) {
  const m = /^(?:"?([^"<]*)"?\s*)?<([^>]+)>$/.exec(raw.trim());
  const addr = (m ? m[2]! : raw).trim().toLowerCase();
  const name = (m?.[1] ?? '').trim() || addr.split('@')[0]!;
  return { addr, name };
}

export async function getMessage(store: TokenStore, id: string): Promise<ParsedEmail> {
  const m = await googleFetch<any>(store, `${G}/messages/${id}?format=full`);
  const h = m.payload?.headers ?? [];
  const { addr, name } = parseFrom(header(h, 'From') ?? '');
  return { id: m.id, threadId: m.threadId, from: addr, fromName: name, subject: header(h, 'Subject') ?? '', text: stripQuoted(bodyOf(m.payload)), messageIdHeader: header(h, 'Message-ID') ?? header(h, 'Message-Id'), at: new Date(Number(m.internalDate ?? Date.now())), labels: m.labelIds ?? [] };
}

export async function getHeaders(store: TokenStore, id: string) {
  const m = await googleFetch<any>(store, `${G}/messages/${id}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References&metadataHeaders=Subject`);
  const h = m.payload?.headers ?? [];
  return { messageId: header(h, 'Message-ID') ?? header(h, 'Message-Id'), references: header(h, 'References'), subject: header(h, 'Subject') };
}

export const profile = (store: TokenStore) => googleFetch<{ emailAddress: string; historyId: string }>(store, `${G}/profile`);

// New message ids since a history id; throws 404 when the id is too old.
export async function newMessageIds(store: TokenStore, startHistoryId: string): Promise<{ ids: string[]; historyId: string }> {
  const ids = new Set<string>();
  let historyId = startHistoryId;
  let pageToken: string | undefined;
  do {
    const r = await googleFetch<any>(store, `${G}/history?startHistoryId=${startHistoryId}&historyTypes=messageAdded&labelId=INBOX${pageToken ? `&pageToken=${pageToken}` : ''}`);
    for (const h of r.history ?? []) for (const a of h.messagesAdded ?? []) ids.add(a.message.id);
    historyId = r.historyId ?? historyId;
    pageToken = r.nextPageToken;
  } while (pageToken);
  return { ids: [...ids], historyId };
}

export async function recentInboxIds(store: TokenStore): Promise<string[]> {
  const r = await googleFetch<any>(store, `${G}/messages?labelIds=INBOX&maxResults=10`);
  return (r.messages ?? []).map((m: any) => m.id);
}

const enc = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=`);

export async function sendEmail(store: TokenStore, m: { from: string; to: string; subject: string; body: string; threadId?: string | null; inReplyTo?: string | null; references?: string | null }) {
  const lines = [
    `From: ${m.from}`,
    `To: ${m.to}`,
    `Subject: ${enc(m.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    ...(m.inReplyTo ? [`In-Reply-To: ${m.inReplyTo}`, `References: ${[m.references, m.inReplyTo].filter(Boolean).join(' ')}`] : []),
    '',
    (Buffer.from(m.body).toString('base64').match(/.{1,76}/g) ?? []).join('\r\n'),
  ];
  const raw = Buffer.from(lines.join('\r\n')).toString('base64url');
  return googleFetch<{ id: string; threadId: string }>(store, `${G}/messages/send`, { method: 'POST', body: { raw, ...(m.threadId ? { threadId: m.threadId } : {}) } });
}
