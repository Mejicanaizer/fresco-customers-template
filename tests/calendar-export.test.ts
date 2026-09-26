import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appointmentCalendar } from '../src/lib/calendar-export.ts';
import { makeSite, receipt } from './fixtures.ts';

test('calendar exports confirmed absolute instants and escapes untrusted public text without injecting properties', () => {
  const site = makeSite(); site.name = 'Estudio, café; uno\\dos\r\nATTENDEE:intruder';
  site.contact.address = 'Calle; 1, Centro';
  const result = appointmentCalendar(receipt(site, 'confirmed'), site, new Date('2026-09-25T00:00:00Z'))!;
  const unfolded = result.replace(/\r\n /g, '');
  assert.match(unfolded, /DTSTART:20300612T150000Z\r\nDTEND:20300612T154500Z/);
  assert.match(unfolded, /SUMMARY:Corte de autor · Estudio\\, café\\; uno\\\\dos\\nATTENDEE:intruder/);
  assert.doesNotMatch(unfolded, /\r\nATTENDEE:/);
  assert.doesNotMatch(result, /manage=|receipt=|whatsapp|Stripe|clientSecret/);
  assert.ok(result.endsWith('END:VCALENDAR\r\n'));
});

test('calendar gates all unconfirmed states and folds UTF-8 without splitting characters', () => {
  const site = makeSite(); site.services[0].name = 'á🐾'.repeat(100);
  for (const state of ['awaiting_payment', 'payment_processing', 'payment_review', 'pending_approval', 'cancelled', 'expired', 'declined'] as const) assert.equal(appointmentCalendar(receipt(site, state), site), null);
  const result = appointmentCalendar(receipt(site, 'confirmed'), site)!;
  for (const line of result.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
  assert.ok(result.replace(/\r\n /g, '').includes('á🐾'.repeat(100)));
});
