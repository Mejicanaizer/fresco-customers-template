/** Explicitly gated LIVE QA. Uses the real gateway; never imports fixtures. */
import assert from 'node:assert/strict';
import { lstat, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { deploymentFromEnv } from '../server/gateway.ts';
import { createStorefrontApi, StorefrontError } from '../src/lib/api.ts';
import { dateInZone, id, localDate, object, parseBookingInput } from '../src/lib/contracts.ts';
import type { BookingInput, BookingResult, GuestBooking, Receipt, Slot, Storefront } from '../src/lib/contracts.ts';

const journalPath = '/private/tmp/fresco-storefront-live-qa.json';
type Phase = 'prepare' | 'create' | 'inspect' | 'reschedule' | 'cancel';
interface Journal {
  version: 1; label: string; site: Storefront; input: BookingInput;
  createKey: string; firstSlot: Slot; replacementSlot: Slot; createDispatched?: boolean;
  created?: BookingResult;
  rescheduleAttempt?: { site: Storefront; previous: Receipt; slot: Slot; key: string };
  rescheduled?: GuestBooking;
  cancelAttempt?: { site: Storefront; previous: Receipt; key: string };
  cancelled?: GuestBooking;
}
let stage = 'approval gate';
let locked = false;
try {
  // This switch only prevents accidental execution; it does not grant authorization.
  // Set it only after the coordinating task explicitly confirms live QA readiness.
  assert.equal(process.env.STOREFRONT_LIVE_QA_APPROVED, '1');
  const phase = process.argv[2] as Phase;
  assert.ok(['prepare', 'create', 'inspect', 'reschedule', 'cancel'].includes(phase));
  stage = 'fixed local binding';
  const deployment = deploymentFromEnv(process.env);
  assert.ok(deployment?.ownerApiToken);
  assert.equal(deployment.siteId, 'best-in-show-grooming');
  assert.equal(deployment.publicOrigin, 'http://127.0.0.1:5373');
  assert.equal(deployment.ownerApiOrigin, 'http://127.0.0.1:5372');
  stage = 'exclusive QA process lock';
  await writeFile(`${journalPath}.lock`, String(process.pid), { mode: 0o600, flag: 'wx' });
  locked = true;
  const origin = deployment.publicOrigin;
  // Browser-equivalent transport: commands go through the gateway, not owner RPCs.
  const api = createStorefrontApi(async (input, init) => {
    const url = new URL(String(input), origin);
    assert.equal(url.origin, origin);
    assert.ok(url.pathname.startsWith('/api/storefront/v1/'));
    const headers = new Headers(init?.headers);
    if (init?.method === 'POST') headers.set('Origin', origin);
    return fetch(url, { ...init, headers });
  });
  function unpaid(site: Storefront) {
    assert.equal(site.siteId, deployment!.siteId);
    assert.equal(site.booking.mode, 'direct');
    assert.equal(site.booking.payment, 'none');
    assert.equal(site.booking.notifications, 'none');
    assert.ok(site.capabilities.grooming);
  }
  function cleanReceipt(receipt: Receipt) {
    assert.equal(receipt.payment, 'none');
    assert.equal(receipt.quote.depositMinor, 0);
    assert.equal(receipt.checkout, null);
    assert.equal(receipt.notification, 'unconfigured');
  }
  const future = (slot: Slot) => Date.parse(slot.startsAt) >= Date.now() + 48 * 60 * 60 * 1000;
  const separated = (a: Slot, b: Slot) => Date.parse(a.endsAt) <= Date.parse(b.startsAt) || Date.parse(b.endsAt) <= Date.parse(a.startsAt);
  async function save(journal: Journal) {
    const temporary = `${journalPath}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(journal), { mode: 0o600, flag: 'wx' });
    await rename(temporary, journalPath);
  }
  function report(phase: Phase, journal: Journal, receipt?: Receipt) {
    // Only a public reference, fictitious marker and schedule IDs. NEVER tokens/keys/bodies.
    console.log(JSON.stringify({
      phase, marker: journal.label, reference: receipt?.reference,
      state: receipt?.state, startsAt: receipt?.startsAt ?? journal.firstSlot.startsAt,
      endsAt: receipt?.endsAt ?? journal.firstSlot.endsAt,
      serviceId: journal.input.serviceId, providerId: receipt?.providerId ?? journal.firstSlot.providerId,
      result: 'PASS',
    }));
  }

  if (phase === 'prepare') {
    stage = 'approved QA selection file';
    assert.ok(process.argv[3], 'Provide the coordinator-selected service/date file');
    const selection = object(JSON.parse(await readFile(process.argv[3], 'utf8')));
    const serviceId = id(selection.serviceId);
    const initialDate = localDate(selection.initialDate), replacementDate = localDate(selection.replacementDate);
    const initialSlotId = selection.initialSlotId == null ? null : id(selection.initialSlotId);
    const replacementSlotId = selection.replacementSlotId == null ? null : id(selection.replacementSlotId);
    const whatsapp = typeof selection.whatsapp === 'string' ? selection.whatsapp : '+12025550199';
    stage = 'real published catalog and availability';
    const site = await api.bootstrap(); unpaid(site);
    assert.ok(site.booking.ready);
    assert.ok(site.services.some(service => service.id === serviceId));
    const first = await api.availability(site, serviceId, initialDate);
    const replacement = initialDate === replacementDate ? first : await api.availability(site, serviceId, replacementDate);
    const firstSlot = first.slots.find(slot => future(slot) && (!initialSlotId || slot.id === initialSlotId));
    assert.ok(firstSlot, 'No selected slot at least48h away');
    const replacementSlot = replacement.slots.find(slot => future(slot) && slot.id !== firstSlot.id && separated(slot, firstSlot) && (!replacementSlotId || slot.id === replacementSlotId));
    assert.ok(replacementSlot, 'Need a distinct non-overlapping replacement slot at least48h away');
    const label = `QA Storefront ${randomUUID().slice(0, 8)}`;
    const input = parseBookingInput({
      revision: site.revision, expectedMode: 'direct', serviceId, slotId: firstSlot.id,
      guest: { name: label, whatsapp }, notes: `${label}: prueba temporal autorizada, sin cobro ni mensajes; cancelar al finalizar.`,
      pet: { name: `QA Mascota ${label.slice(-8)}`, sizeId: null, breed: null, ageMonths: null, behaviorNotes: '', groomingPreferences: '', photoUploadId: null },
    });
    const journal: Journal = { version: 1, label, site, input, createKey: randomUUID(), firstSlot, replacementSlot };
    stage = 'exclusive private journal creation';
    // Existing journals are NEVER overwritten: retries must retain the original key.
    await writeFile(journalPath, JSON.stringify(journal), { mode: 0o600, flag: 'wx' });
    report(phase, journal);
  } else {
    stage = 'existing private QA journal';
    const metadata = await lstat(journalPath);
    assert.ok(metadata.isFile() && !metadata.isSymbolicLink() && metadata.size < 100_000);
    assert.equal(metadata.mode & 0o077, 0);
    assert.equal(metadata.uid, process.getuid?.());
    const journal: Journal = JSON.parse(await readFile(journalPath, 'utf8'));
    assert.equal(journal.version, 1); unpaid(journal.site);
    assert.ok(journal.label.startsWith('QA Storefront '));
    let current: Receipt | undefined;
    if (phase === 'create') {
      stage = 'create/recover the one marked test appointment';
      if (!journal.createDispatched) {
        assert.ok(future(journal.firstSlot));
        // Re-mint the same published slot after a pause; do not silently choose another.
        const availability = await api.availability(journal.site, journal.input.serviceId, dateInZone(journal.firstSlot.startsAt, journal.site.branch.timeZone));
        assert.equal(availability.revision, journal.site.revision);
        assert.ok(availability.slots.some(slot => slot.id === journal.firstSlot.id));
        // Persist before dispatch. An uncertain retry skips mutable preconditions;
        // the owner must look up its original ledger result even if the slot is gone.
        journal.createDispatched = true;
        await save(journal);
      }
      const result = await api.book(journal.site, journal.input, journal.createKey, journal.firstSlot);
      cleanReceipt(result.receipt);
      if (journal.created) assert.deepEqual(result, journal.created);
      else { journal.created = result; await save(journal); }
      stage = 'immutable create replay';
      assert.deepEqual(await api.book(journal.site, journal.input, journal.createKey, journal.firstSlot), result);
    } else {
      assert.ok(journal.created, 'Recover the create result before changing the booking');
      const site = phase === 'reschedule' ? journal.rescheduleAttempt?.site ?? await api.bootstrap()
        : phase === 'cancel' ? journal.cancelAttempt?.site ?? await api.bootstrap() : journal.site;
      unpaid(site);
      if (phase === 'reschedule') {
        assert.ok(!journal.cancelAttempt, 'Do not reschedule after starting cancellation');
        if (!journal.rescheduleAttempt) {
          stage = 'select the approved replacement from real current availability';
          const previous = await api.guest(site, journal.created.managementToken);
          assert.equal(previous.receipt.reference, journal.created.receipt.reference);
          assert.ok(previous.actions.canReschedule);
          assert.ok(future(journal.replacementSlot));
          const slots = await api.availability(site, journal.input.serviceId, dateInZone(journal.replacementSlot.startsAt, site.branch.timeZone));
          const slot = slots.slots.find(value => value.id === journal.replacementSlot.id);
          assert.ok(slot, 'Approved replacement is no longer available; no new slot chosen');
          journal.rescheduleAttempt = { site, previous: previous.receipt, slot, key: randomUUID() };
          await save(journal);
        }
        stage = 'reschedule/recover with original management capability';
        const attempt = journal.rescheduleAttempt;
        const result = await api.reschedule(attempt.site, journal.created.managementToken, attempt.previous, attempt.slot, attempt.key);
        cleanReceipt(result.receipt);
        if (journal.rescheduled) assert.deepEqual(result, journal.rescheduled);
        else { journal.rescheduled = result; await save(journal); }
        stage = 'immutable reschedule replay';
        assert.deepEqual(await api.reschedule(attempt.site, journal.created.managementToken, attempt.previous, attempt.slot, attempt.key), result);
      } else if (phase === 'cancel') {
        assert.ok(!journal.rescheduleAttempt || journal.rescheduled, 'Recover the reschedule result before cancellation');
        if (!journal.cancelAttempt) {
          stage = 'read current guest revision before cancellation';
          const previous = await api.guest(site, journal.created.managementToken);
          assert.equal(previous.receipt.reference, journal.created.receipt.reference);
          assert.ok(previous.actions.canCancel);
          journal.cancelAttempt = { site, previous: previous.receipt, key: randomUUID() };
          await save(journal);
        }
        stage = 'cancel/recover with original management capability';
        const attempt = journal.cancelAttempt;
        const result = await api.cancel(attempt.site, journal.created.managementToken, attempt.previous, attempt.key);
        cleanReceipt(result.receipt);
        if (journal.cancelled) assert.deepEqual(result, journal.cancelled);
        else { journal.cancelled = result; await save(journal); }
        stage = 'immutable cancellation replay';
        assert.deepEqual(await api.cancel(attempt.site, journal.created.managementToken, attempt.previous, attempt.key), result);
      }
    }
    stage = 'status and guest reads using the original capabilities';
    assert.ok(journal.created);
    const expected = journal.cancelled?.receipt ?? journal.rescheduled?.receipt ?? journal.created.receipt;
    current = await api.status(journal.site, journal.created.receiptToken);
    const guest = await api.guest(journal.site, journal.created.managementToken);
    cleanReceipt(current);
    assert.deepEqual(current, expected);
    assert.deepEqual(guest.receipt, expected);
    if (current.state === 'cancelled') {
      assert.equal(guest.actions.canCancel, false); assert.equal(guest.actions.canReschedule, false);
    }
    report(phase, journal, current);
  }
} catch (error) {
  // Assertion objects and command/response bodies can contain private capabilities.
  // Never print them. A failed phase retains its command/key for explicit recovery.
  const code = error instanceof StorefrontError ? error.code : 'check_failed';
  console.error(JSON.stringify({ result: 'STOP', stage, code, uncertain: error instanceof StorefrontError ? error.uncertain : undefined }));
  process.exitCode = 1;
} finally {
  if (locked) await unlink(`${journalPath}.lock`);
}
