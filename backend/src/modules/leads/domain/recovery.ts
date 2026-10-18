import type { AssignmentRules, Lead, RecoveryReason } from './types.js';

export const ESCALATED_MULTIPLE_THRESHOLD = 2;

// "25 min 53 s", "2 h 5 min", "45 s": never raw seconds.
export function humanDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h} h${m ? ` ${m} min` : ''}`;
}

export function recoveryReasons(lead: Lead, rules: Pick<AssignmentRules, 'idleSeconds'>, now: Date): RecoveryReason[] {
  if (lead.state === 'closed') return [];
  const out: RecoveryReason[] = [];

  // unassigned outside intake means nobody could take it: stuck at the end of the chain or nobody Available
  if (lead.state === 'unassigned') {
    out.push({ code: 'unacked_overdue', text: 'No eligible owner, needs a manager to assign' });
  } else if (lead.state === 'assigned' && lead.ackDeadline && lead.ackDeadline.getTime() <= now.getTime()) {
    const over = Math.floor((now.getTime() - lead.ackDeadline.getTime()) / 1000);
    out.push({ code: 'unacked_overdue', text: `Not acknowledged: ${humanDuration(over)} past the window` });
  }

  if (lead.escalationCount >= ESCALATED_MULTIPLE_THRESHOLD) {
    out.push({ code: 'escalated_multiple', text: `Escalated ${lead.escalationCount} times` });
  }

  const idle = Math.floor((now.getTime() - lead.lastActionAt.getTime()) / 1000);
  if (idle >= rules.idleSeconds) {
    const away = lead.ownerAway ? ' (owner away)' : '';
    out.push({ code: 'idle', text: `Idle: no action for ${humanDuration(idle)} (limit ${humanDuration(rules.idleSeconds)})${away}` });
  }

  return out;
}
