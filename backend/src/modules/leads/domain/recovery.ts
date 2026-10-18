import type { AssignmentRules, Lead, RecoveryReason } from './types.js';

export const ESCALATED_MULTIPLE_THRESHOLD = 2;

export function recoveryReasons(lead: Lead, rules: Pick<AssignmentRules, 'idleSeconds'>, now: Date): RecoveryReason[] {
  if (lead.state === 'closed') return [];
  const out: RecoveryReason[] = [];

  if (lead.state === 'assigned' && lead.ackDeadline && lead.ackDeadline.getTime() <= now.getTime()) {
    const over = Math.floor((now.getTime() - lead.ackDeadline.getTime()) / 1000);
    out.push({ code: 'unacked_overdue', text: `Not acknowledged, ${over}s past the window` });
  }

  if (lead.escalationCount >= ESCALATED_MULTIPLE_THRESHOLD) {
    out.push({ code: 'escalated_multiple', text: `Escalated ${lead.escalationCount} times` });
  }

  const idle = Math.floor((now.getTime() - lead.lastActionAt.getTime()) / 1000);
  if (idle >= rules.idleSeconds) {
    const away = lead.ownerAway ? ' (owner away)' : '';
    out.push({ code: 'idle', text: `No recorded action for ${idle}s${away}` });
  }

  return out;
}
