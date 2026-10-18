import { describe, expect, it } from 'vitest';
import { applyAcknowledge, applyStuck } from '../escalate.js';
import { at, lead } from './helpers.js';

describe('applyStuck', () => {
  it('clears the owner, keeps the deadline and bumps the version', () => {
    const l = applyStuck(lead(), 3);
    expect(l).toMatchObject({ state: 'unassigned', ownerId: null, version: 2, escalationLevel: 3, ackDeadline: at(30) });
    expect(l.ownerHistory).toEqual(['a']);
  });
});

describe('applyAcknowledge', () => {
  it('sets the first acknowledgement once', () => {
    const l = applyAcknowledge(lead(), at(12));
    expect(l).toMatchObject({ state: 'acknowledged', version: 2, firstAcknowledgedAt: at(12), lastActionAt: at(12) });
    const again = applyAcknowledge({ ...l, state: 'assigned' }, at(50));
    expect(again.firstAcknowledgedAt).toEqual(at(12));
  });
});
