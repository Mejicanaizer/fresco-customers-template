import { useCallback, useEffect, useRef, useState } from 'react';
import type { GuestBooking, Receipt, Slot, Storefront } from '../lib/contracts';
import { formatAppointment } from '../lib/contracts';
import type { StorefrontApi } from '../lib/api';
import { createRequestId, StorefrontError } from '../lib/api';
import { ReceiptDetails, ReceiptTerms } from './AppointmentPass';
import { BookingDrawer } from './BookingDrawer';
import { SlotPicker } from './SlotPicker';
import { ManagementLink } from './ManagementLink';
import { PaymentModal } from './PaymentModal';
import { assertReceiptContinuity, handoffCheckout } from '../lib/payment';
import { useBookingStatus } from '../lib/useBookingStatus';

type Change = { kind: 'cancel' | 'reschedule'; key: string; previous: Receipt; slot: Slot | null };
const receiptOf = (value: GuestBooking) => value.receipt;
export function GuestManagement({ site, api, token, provider, onBrowse, initialReceipt, refreshLabel = 'Actualizar cita' }: { site: Storefront; api: StorefrontApi; token: string; provider?: Slot | null; onBrowse?: () => void; initialReceipt?: Receipt; refreshLabel?: string }) {
  const [error, setError] = useState('');
  const [receiptProvider, setReceiptProvider] = useState(provider);
  const [mode, setMode] = useState<'cancel' | 'reschedule' | null>(null), [slot, setSlot] = useState<Slot | null>(null), [change, setChange] = useState<Change | null>(null);
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
  const pending = useRef(false);
  const read = useCallback(async (signal: AbortSignal) => { const next = await api.guest(site, token, signal); assertReceiptContinuity(initialReceipt ?? null, next.receipt); return next; }, [api, site, token, initialReceipt]);
  const { value: booking, loading, error: readError, refresh: load, replace: setBooking, verified } = useBookingStatus({ read, receiptOf, paused: busy || uncertain || mode !== null });
  useEffect(() => {
    if (!busy && !uncertain) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [busy, uncertain]);
  async function mutate(command: Change) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(''); setChange(command);
    try {
      const result = command.kind === 'cancel' ? await api.cancel(site, token, command.previous, command.key) : await api.reschedule(site, token, command.previous, command.slot!, command.key);
      setBooking(result); if (command.slot) setReceiptProvider(command.slot); setMode(null); setSlot(null); setChange(null); setUncertain(false);
    } catch (e) { setUncertain(!(e instanceof StorefrontError) || e.uncertain); setError(e instanceof Error ? e.message : 'No pudimos verificar el resultado.'); }
    finally { pending.current = false; setBusy(false); }
  }
  function submit(kind: Change['kind']) {
    if (!booking || busy || uncertain || !(kind === 'cancel' ? booking.actions.canCancel : booking.actions.canReschedule)) return;
    const old = change?.kind === kind && change.previous.bookingRevision === booking.receipt.bookingRevision && change.slot?.id === slot?.id ? change : null;
    try { void mutate(old ?? { kind, key: createRequestId(), previous: booking.receipt, slot }); }
    catch (e) { setError(e instanceof Error ? e.message : 'No pudimos preparar la solicitud.'); }
  }
  const editable = !!booking && verified && !busy && !uncertain && !loading && !readError;
  function checkout() {
    if (!booking || !editable) return;
    try { handoffCheckout(booking.receipt, { type: 'manage', token }, window); }
    catch { setError('No pudimos abrir el pago. Actualiza el estado antes de continuar.'); }
  }
  const displayedReceipt = booking?.receipt ?? initialReceipt;
  const feedback = <>
    {busy && <p role="status">Enviando el cambio…</p>}
    {(error || readError) && <p className="form-error" role="alert">{error || readError}</p>}
    {uncertain && change && <div className="notice"><p>No sabemos si el cambio se completó. Recuperaremos el resultado con la misma solicitud.</p><button className="app-tienda-btn-confirm" type="button" disabled={busy} onClick={() => void mutate(change)}>Recuperar resultado del cambio</button></div>}
  </>;
  return <section className="booking-status" aria-label="Gestionar tu cita">
    <h1 className="sr-only">Gestionar tu cita</h1>
    {loading && <p role="status">Consultando tu enlace privado…</p>}
    {displayedReceipt && <ReceiptDetails hasManagement receipt={displayedReceipt} site={site} provider={receiptProvider} verified={verified || !!initialReceipt} actionsEnabled={editable && !mode} onCheckout={checkout} checkoutEnabled={editable && !mode} />}
    {booking && <>
      {booking.receipt.checkout?.mode === 'embedded' && booking.receipt.state === 'awaiting_payment' && booking.receipt.paymentStatus !== 'paid' && verified && !mode && !busy && !uncertain &&
        <PaymentModal key={booking.receipt.checkout.clientSecret} checkout={booking.receipt.checkout} refresh={() => { void load(); }} loading={loading} error={readError} />}
      <ManagementLink token={token} receipt={booking.receipt} />
      <div className="management-actions">
        <h2>¿Cambio de planes?</h2><p>Fecha límite para cambios: {formatAppointment(booking.actions.deadlineAt, site)} · {site.branch.timeZone}.</p>
        {!uncertain && <div className="management-buttons">
          <button className="secondary-button" type="button" disabled={!editable || !booking.actions.canReschedule} onClick={() => { setMode('reschedule'); setSlot(null); }}>Reprogramar cita</button>
          <button className="secondary-button cancel-button" type="button" disabled={!editable || !booking.actions.canCancel} onClick={() => setMode('cancel')}>Cancelar cita</button>
        </div>}
        {booking.actions.unavailableReason === 'policy_unconfigured' && <p>El negocio debe configurar las condiciones de la reserva antes de permitir cambios.</p>}
        {(!editable || booking.actions.unavailableReason === 'deadline_passed') && !busy && !uncertain && <p className="field-help">Los cambios disponibles los valida el negocio. Se requiere un mínimo de 24 horas de anticipación.</p>}
        {mode === 'cancel' && <div className="cancel-confirmation"><h3>¿Cancelar tu cita?</h3><p>Se solicitará cancelar esta cita. Las condiciones aceptadas de la reserva son: {booking.receipt.terms.text}</p>
          {!uncertain && <div className="management-buttons"><button className="secondary-button cancel-button" type="button" disabled={!editable || !booking.actions.canCancel} onClick={() => submit('cancel')}>Confirmar cancelación</button><button type="button" className="secondary-button" disabled={busy} onClick={() => setMode(null)}>Volver sin cambios</button></div>}
        </div>}
      </div>
      {mode === 'reschedule' && <BookingDrawer open locked={busy || uncertain} title="Reprogramar cita" subtitle="Elige una nueva fecha y hora" closeLabel="Cerrar cambio de horario" onClose={() => setMode(null)}>
        <div className="booking-form"><div className="drawer-body">
          <div className="drawer-service"><div><h3>{site.services.find(service => service.id === booking.receipt.serviceId)?.name ?? 'Servicio de tu cita'}</h3><p>Actual: {formatAppointment(booking.receipt.startsAt, site)}</p></div></div>
          <SlotPicker site={site} serviceId={booking.receipt.serviceId} api={api} selected={slot} onSelect={setSlot} disabled={!editable} />
          <p className="field-help">Conservas el precio y las condiciones aceptadas de tu reserva.</p>{feedback}
        </div><footer className="drawer-footer">
          {!uncertain && <button className="app-tienda-btn-confirm" type="button" disabled={!editable || !slot || !booking.actions.canReschedule} onClick={() => submit('reschedule')}>{busy ? 'Enviando…' : 'Confirmar nuevo horario'}</button>}
          {!uncertain && <button type="button" className="text-button" disabled={busy} onClick={() => setMode(null)}>Volver sin cambios</button>}
        </footer></div>
      </BookingDrawer>}
    </>}
    {!booking && initialReceipt && <ManagementLink token={token} receipt={initialReceipt} />}
    {mode !== 'reschedule' && feedback}
    <div className="receipt-bottom-row">{displayedReceipt && <ReceiptTerms receipt={displayedReceipt} />}
    {!uncertain && <button className="text-button receipt-refresh" type="button" disabled={busy || loading || !!mode} onClick={() => { setError(''); void load(); }}>{refreshLabel}</button>}</div>
    {onBrowse && !busy && !uncertain && !mode && <button type="button" className="text-button browse-services" onClick={onBrowse}>{booking?.receipt.state === 'cancelled' ? 'Reservar otra cita' : 'Ver otros servicios'}</button>}
  </section>;
}
