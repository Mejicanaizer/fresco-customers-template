import { useCallback, useEffect, useRef, useState } from 'react';
import type { GuestBooking, Receipt, Slot, Storefront } from '../lib/contracts';
import { formatAppointment } from '../lib/contracts';
import type { StorefrontApi } from '../lib/api';
import { createRequestId, StorefrontError } from '../lib/api';
import { ReceiptDetails } from './BookingReceipt';
import { SlotPicker } from './SlotPicker';
import { ManagementLink } from './ManagementLink';
import { handoffCheckout } from '../lib/payment';
import { useBookingStatus } from '../lib/useBookingStatus';

type Change = { kind: 'cancel' | 'reschedule'; key: string; previous: Receipt; slot: Slot | null };
const receiptOf = (value: GuestBooking) => value.receipt;
export function GuestManagement({ site, api, token }: { site: Storefront; api: StorefrontApi; token: string }) {
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'cancel' | 'reschedule' | null>(null), [slot, setSlot] = useState<Slot | null>(null), [change, setChange] = useState<Change | null>(null);
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
  const pending = useRef(false);
  const read = useCallback((signal: AbortSignal) => api.guest(site, token, signal), [api, site, token]);
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
      setBooking(result); setMode(null); setSlot(null); setChange(null); setUncertain(false);
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
  return <section className="booking-status" aria-label="Gestionar tu cita">
    <h1>Gestionar tu cita</h1>
    {loading && <p role="status">Consultando tu enlace privado…</p>}
    {booking && <>
      <ReceiptDetails receipt={booking.receipt} site={site} onCheckout={checkout} checkoutEnabled={editable && !mode} />
      <p>Fecha límite para cambios: {formatAppointment(booking.actions.deadlineAt, site)} · {site.branch.timeZone}.</p>
      {!uncertain && <div className="button-row">
        <button className="secondary-button" type="button" disabled={!editable || !booking.actions.canReschedule} onClick={() => { setMode('reschedule'); setSlot(null); }}>Reprogramar cita</button>
        <button className="secondary-button" type="button" disabled={!editable || !booking.actions.canCancel} onClick={() => setMode('cancel')}>Cancelar cita</button>
      </div>}
      {booking.actions.unavailableReason === 'policy_unconfigured' && <p>El negocio debe configurar las condiciones de la reserva antes de permitir cambios.</p>}
      {(!editable || booking.actions.unavailableReason === 'deadline_passed') && !busy && !uncertain && <p className="field-help">Los cambios disponibles los valida el negocio. Se requiere un mínimo de 24 horas de anticipación.</p>}
      {mode === 'reschedule' && <><SlotPicker site={site} serviceId={booking.receipt.serviceId} api={api} selected={slot} onSelect={setSlot} disabled={!editable} /><button className="app-tienda-btn-confirm" type="button" disabled={!editable || !slot || !booking.actions.canReschedule} onClick={() => submit('reschedule')}>Confirmar nuevo horario</button></>}
      {mode === 'cancel' && <div className="notice"><p>Se solicitará cancelar esta cita. Las condiciones aceptadas de la reserva son: {booking.receipt.terms.text}</p><button className="app-tienda-btn-confirm" type="button" disabled={!editable || !booking.actions.canCancel} onClick={() => submit('cancel')}>Confirmar cancelación</button></div>}
      {mode && !uncertain && <button type="button" className="secondary-button" disabled={busy} onClick={() => setMode(null)}>Volver sin cambios</button>}
    </>}
    {busy && <p role="status">Enviando el cambio…</p>}
    {(error || readError) && <p className="form-error" role="alert">{error || readError}</p>}
    {uncertain && change ? <div className="notice"><p>No sabemos si el cambio se completó. Recuperaremos el resultado con la misma solicitud.</p><button className="app-tienda-btn-confirm" type="button" disabled={busy} onClick={() => void mutate(change)}>Recuperar resultado del cambio</button></div> : <button className="secondary-button" type="button" disabled={busy || loading || !!mode} onClick={() => { setError(''); void load(); }}>Actualizar cita</button>}
    {booking && <ManagementLink token={token} />}
  </section>;
}
