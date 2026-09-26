import { useRef, useState } from 'react';
import type { Receipt } from '../lib/contracts';
import { BookingDrawer } from './BookingDrawer';
import { EmbeddedPayment } from './EmbeddedPayment';

type Checkout = Extract<NonNullable<Receipt['checkout']>, { mode: 'embedded' }>;

/** Closing checkout preserves the reservation; only owner status confirms payment. */
export function PaymentModal({ checkout, refresh, loading, error }: { checkout: Checkout; refresh: () => void; loading: boolean; error: string }) {
  const [open, setOpen] = useState(true), [completed, setCompleted] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return <>
    <button ref={trigger} className="app-tienda-btn-confirm" type="button" onClick={() => setOpen(true)}>{completed ? 'Consultar pago' : 'Continuar al pago'}</button>
    <BookingDrawer open={open} locked={false} presentation="payment" returnFocus={trigger} title="Pagar anticipo" subtitle="Completa tu pago sin salir de esta página" closeLabel="Cerrar pago" onClose={() => setOpen(false)}>
      <div className="payment-modal-body">
        {open && (completed ? <p className="payment-modal-message" role="status">Estamos verificando tu pago con el negocio. Tu cita aún no está confirmada.</p> : <EmbeddedPayment checkout={checkout} onComplete={() => { setCompleted(true); refresh(); }} />)}
        {error && <p className="payment-modal-message form-error" role="alert">{error}</p>}
      </div>
      <footer className="drawer-footer">
        <button className="secondary-button" type="button" aria-disabled={loading} onClick={() => { if (!loading) refresh(); }}>{loading ? 'Consultando el pago…' : 'Actualizar estado del pago'}</button>
        <button className="text-button" type="button" onClick={() => setOpen(false)}>Volver a mi reserva</button>
      </footer>
    </BookingDrawer>
  </>;
}
