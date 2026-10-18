import { pgEnum } from 'drizzle-orm/pg-core';

export const baseLevel = pgEnum('base_level', ['owner', 'admin', 'user']);
export const availability = pgEnum('availability', ['available', 'busy', 'on_leave', 'offline']);
export const customFieldEntity = pgEnum('custom_field_entity', ['contact', 'opportunity']);
export const customFieldType = pgEnum('custom_field_type', ['text', 'number', 'date', 'dropdown', 'checkbox']);
export const activityType = pgEnum('activity_type', [
  'note', 'call_log', 'stage_change', 'assignment', 'field_edit', 'message', 'payment', 'appointment', 'lead_ack', 'lead_escalation',
]);
export const leadSource = pgEnum('lead_source', ['webform', 'whatsapp', 'manual', 'discord']);
export const leadStatus = pgEnum('lead_status', ['unassigned', 'assigned', 'acknowledged', 'closed']);
export const assignmentReason = pgEnum('assignment_reason', ['initial', 'ack_expired', 'manual', 'owner_unavailable']);
export const messageDirection = pgEnum('message_direction', ['in', 'out']);
export const messageStatus = pgEnum('message_status', ['queued', 'sent', 'delivered', 'read', 'failed', 'received']);
export const paymentStatus = pgEnum('payment_status', ['requested', 'paid', 'expired', 'failed', 'refunded', 'partially_refunded']);
export const appointmentStatus = pgEnum('appointment_status', ['scheduled', 'cancelled', 'completed']);
export const provider = pgEnum('provider', ['twilio', 'stripe', 'google', 'telegram']);
export const connectionStatus = pgEnum('connection_status', ['not_connected', 'connected', 'error']);
export const eventDirection = pgEnum('event_direction', ['in', 'out']);
export const outboxStatus = pgEnum('outbox_status', ['pending', 'running', 'done', 'failed']);
