import { Router } from 'express';
import { z } from 'zod';
import { db, pool } from '../../core/db/client.js';
import { asyncHandler } from '../../core/errors.js';
import { requireAuth } from '../../core/auth/sessions.js';
import { requirePermission } from '../../core/rbac/index.js';
import { getWorkspace, updateWorkspace } from './service.js';

const tz = z.string().refine((v) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: v });
    return true;
  } catch {
    return false;
  }
}, 'Unknown time zone');

const patch = z
  .object({ name: z.string().trim().min(2).max(80), timezone: tz, defaultCurrency: z.string().length(3).toUpperCase() })
  .partial()
  .strict();

export const workspaceRouter = Router();

workspaceRouter.get(
  '/workspace',
  requireAuth,
  asyncHandler(async (req, res) => {
    const w = await getWorkspace(db, req.auth!.workspaceId);
    res.json({ workspace: { id: w.id, name: w.name, slug: w.slug, timezone: w.timezone, defaultCurrency: w.defaultCurrency } });
  }),
);

workspaceRouter.patch(
  '/workspace',
  requirePermission('settings.manage'),
  asyncHandler(async (req, res) => {
    const body = patch.parse(req.body);
    const w = await db.transaction((tx) => updateWorkspace(tx, req.auth!.userId, req.auth!.workspaceId, body));
    res.json({ workspace: { id: w.id, name: w.name, slug: w.slug, timezone: w.timezone, defaultCurrency: w.defaultCurrency } });
  }),
);

// Setup checklist for new workspaces; every step is derived from real data, so it ticks itself off.
workspaceRouter.get('/onboarding', requireAuth, asyncHandler(async (req, res) => {
  const ws = req.auth!.workspaceId;
  const one = async (q: string) => Number(((await pool.query(q, [ws])).rows[0] as { n: number }).n);
  const [members, invites, mailbox, stripe, calendars, leads, rules, w] = await Promise.all([
    one(`select count(*)::int n from memberships where workspace_id=$1 and active`),
    one(`select count(*)::int n from invites where workspace_id=$1 and accepted_at is null and expires_at > now()`),
    one(`select count(*)::int n from integration_connections where workspace_id=$1 and provider='gmail' and status='connected'`),
    one(`select count(*)::int n from integration_connections where workspace_id=$1 and provider='stripe' and status='connected'`),
    one(`select count(*)::int n from user_connections where workspace_id=$1 and provider='google' and status='connected'`),
    one(`select count(*)::int n from leads where workspace_id=$1`),
    one(`select count(*)::int n from audit_log where workspace_id=$1 and action='assignment_rules.updated'`),
    getWorkspace(db, ws),
  ]);
  const steps = [
    { key: 'team', title: 'Invite your team', body: 'Add the people who will own leads. They get an email, set a password and are in. Anyone can be added in under a minute.', href: '/settings/team', cta: 'Invite people', done: members > 1 || invites > 0, detail: `${members} on the team${invites ? `, ${invites} invited` : ''}` },
    { key: 'email', title: 'Connect your email', body: 'Customers write to one agency address and replies leave in the same thread. Connect the Gmail account that will be used.', href: '/settings/integrations', cta: 'Connect Gmail', done: mailbox > 0, detail: mailbox ? 'Connected' : 'Not connected yet' },
    { key: 'rules', title: 'Set how fast leads must be answered', body: 'Choose the acknowledgement time, the most open leads per person, and who gets a lead next, then a backup, then a manager.', href: '/settings/assignment', cta: 'Set the rules', done: rules > 0, detail: rules ? 'Saved' : 'Using the defaults' },
    { key: 'calendar', title: 'Connect calendars', body: 'Each person connects their own Google Calendar so visits are booked on real calendars without clashes.', href: '/settings/integrations', cta: 'Connect calendar', done: calendars > 0, detail: `${calendars} connected` },
    { key: 'payments', title: 'Connect payments', body: 'Add your Stripe key to send secure checkout links and see payments land on the customer record.', href: '/settings/integrations', cta: 'Connect Stripe', done: stripe > 0, detail: stripe ? 'Connected' : 'Not connected yet' },
    { key: 'lead', title: 'Receive your first lead', body: 'Share your enquiry form or email your agency address. The lead gets an owner and a countdown straight away.', href: '/leads', cta: 'Open leads', done: leads > 0, detail: `${leads} so far`, extra: { formPath: `/f/${w.slug}` } },
  ];
  res.json({ steps, completed: steps.filter((s) => s.done).length, total: steps.length, workspaceSlug: w.slug });
}));
