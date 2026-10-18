import { db } from '../../core/db/client.js';
import { contacts, opportunities } from '../../core/db/schema/index.js';
import { activity } from '../../core/activity/index.js';
import { getOr404 } from '../../core/db/scoped.js';
import { badRequest } from '../../core/errors.js';
import type { AuthContext } from '../../core/auth/context.js';

export async function addNote(a: AuthContext, i: { contactId?: string; opportunityId?: string; leadId?: string; body: string }) {
  if (!i.contactId && !i.opportunityId && !i.leadId) throw badRequest('A note needs a contact, opportunity, or lead');
  return db.transaction(async (tx) => {
    let contactId = i.contactId ?? null;
    if (i.opportunityId) {
      const opp = await getOr404(tx, opportunities, a.workspaceId, i.opportunityId, 'Opportunity');
      contactId = contactId ?? opp.contactId;
    } else if (contactId) {
      await getOr404(tx, contacts, a.workspaceId, contactId, 'Contact');
    }
    await activity.record(tx, {
      workspaceId: a.workspaceId,
      entity: { contactId, opportunityId: i.opportunityId ?? null, leadId: i.leadId ?? null },
      type: 'note',
      actorId: a.userId,
      data: { body: i.body },
    });
    return { type: 'note' as const, data: { body: i.body }, createdAt: new Date().toISOString() };
  });
}
