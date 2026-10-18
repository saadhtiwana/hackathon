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
  // Set when this is not a person writing: bulk mail, notifications, bounces, auto-replies.
  automated: string | null;
  deliveredTo: string[];
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

const NOREPLY = /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|notifications?|notify|mailer-daemon|postmaster|bounces?|alerts?|newsletter|updates?|support-noreply)([+._-].*)?$/i;

export function automatedReason(addr: string, h: Array<{ name: string; value: string }>): string | null {
  const local = addr.split('@')[0] ?? '';
  if (NOREPLY.test(local)) return `sender ${addr} is a no-reply or notification address`;
  if (header(h, 'List-Unsubscribe') || header(h, 'List-Id')) return 'bulk mail (List-Unsubscribe)';
  const auto = header(h, 'Auto-Submitted');
  if (auto && auto.toLowerCase() !== 'no') return `auto-generated mail (Auto-Submitted: ${auto})`;
  const prec = header(h, 'Precedence');
  if (prec && /bulk|list|junk/i.test(prec)) return `bulk mail (Precedence: ${prec})`;
  return null;
}

export async function getMessage(store: TokenStore, id: string): Promise<ParsedEmail> {
  const m = await googleFetch<any>(store, `${G}/messages/${id}?format=full`);
  const h = m.payload?.headers ?? [];
  const { addr, name } = parseFrom(header(h, 'From') ?? '');
  return { id: m.id, threadId: m.threadId, from: addr, fromName: name, subject: header(h, 'Subject') ?? '', text: stripQuoted(bodyOf(m.payload)), messageIdHeader: header(h, 'Message-ID') ?? header(h, 'Message-Id'), at: new Date(Number(m.internalDate ?? Date.now())), labels: m.labelIds ?? [], automated: automatedReason(addr, h), deliveredTo: [header(h, 'Delivered-To'), header(h, 'To'), header(h, 'Cc')].filter(Boolean).join(',').toLowerCase().split(/[\s,;<>]+/).filter((x) => x.includes('@')) };
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

// Inbox messages delivered to the agency plus-address since the mailbox was connected. The query does the filtering on Google's side.
export async function listForAddress(store: TokenStore, address: string, afterEpochSeconds: number): Promise<string[]> {
  const q = encodeURIComponent(`deliveredto:${address} after:${afterEpochSeconds}`);
  const r = await googleFetch<any>(store, `${G}/messages?labelIds=INBOX&maxResults=25&q=${q}`);
  return (r.messages ?? []).map((m: any) => m.id);
}

const enc = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=`);

export async function sendEmail(store: TokenStore, m: { from: string; to: string; subject: string; body: string; html?: string; replyTo?: string | null; threadId?: string | null; inReplyTo?: string | null; references?: string | null }) {
  const b64lines = (t: string) => (Buffer.from(t).toString('base64').match(/.{1,76}/g) ?? []).join('\r\n');
  const head = [
    `From: ${m.from}`,
    `To: ${m.to}`,
    ...(m.replyTo ? [`Reply-To: ${m.replyTo}`] : []),
    `Subject: ${enc(m.subject)}`,
    'MIME-Version: 1.0',
    ...(m.inReplyTo ? [`In-Reply-To: ${m.inReplyTo}`, `References: ${[m.references, m.inReplyTo].filter(Boolean).join(' ')}`] : []),
  ];
  const boundary = `relay_${Date.now().toString(36)}`;
  const lines = m.html
    ? [...head, `Content-Type: multipart/alternative; boundary="${boundary}"`, '', `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64lines(m.body), `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64lines(m.html), `--${boundary}--`, '']
    : [...head, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64lines(m.body)];
  const raw = Buffer.from(lines.join('\r\n')).toString('base64url');
  return googleFetch<{ id: string; threadId: string }>(store, `${G}/messages/send`, { method: 'POST', body: { raw, ...(m.threadId ? { threadId: m.threadId } : {}) } });
}
