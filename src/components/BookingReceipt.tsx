import { useCallback, useEffect, useRef, useState } from 'react';
import type { PaymentStatus, Receipt, ReceiptState, Storefront } from '../lib/contracts';
import { formatAppointment, formatMoney } from '../lib/contracts';
import type { StorefrontApi } from '../lib/api';
import { handoffCheckout } from '../lib/payment';
import { useBookingStatus } from '../lib/useBookingStatus';

const statusText: Record<ReceiptState, [string, string]> = {
  awaiting_payment: ['Anticipo pendiente', 'Tu cita todavía no está confirmada. Completa el anticipo y consulta aquí el resultado verificado por el negocio.'],
  pending_approval: ['Solicitud recibida', 'El negocio revisará tu solicitud. El horario no está apartado y la cita todavía no está confirmada.'],
  payment_processing: ['Verificando el pago', 'El negocio está verificando el anticipo y la disponibilidad. Aún no hay una cita confirmada.'],
  confirmed: ['Cita confirmada', 'El negocio registró tu cita en su agenda.'],
  payment_review: ['Pago en revisión', 'El negocio debe revisar el pago y la disponibilidad. Tu cita no está confirmada; conserva esta referencia y contacta al negocio.'],
  expired: ['La reserva venció', 'Este intento ya no tiene un horario apartado. Consulta al negocio si realizaste un pago.'],
  cancelled: ['Cita cancelada', 'El negocio registró la cancelación. El estado del anticipo se muestra por separado.'],
  declined: ['Solicitud no aprobada', 'El negocio no aprobó esta solicitud. Puedes consultar otras opciones con el negocio.'],
};
const notifications: Record<Receipt['notification'], string> = {
  unconfigured: 'Las notificaciones automáticas por WhatsApp no están activas. Guarda tu enlace privado para consultar o cambiar tu cita.',
  not_sent: 'Todavía no se envió una notificación por WhatsApp.', queued: 'Notificación por WhatsApp en cola.',
  sent: 'Notificación enviada a WhatsApp; entrega pendiente de verificar.', delivered: 'Notificación entregada por WhatsApp.',
  failed: 'La notificación por WhatsApp no pudo entregarse. Contacta al negocio con tu referencia.',
};
const paymentText: Record<PaymentStatus, string> = {
  unpaid: 'Anticipo sin pagar', processing: 'Pago en verificación', paid: 'Anticipo pagado',
  refund_pending: 'Reembolso en proceso', refunded: 'Reembolso confirmado', refund_failed: 'Reembolso pendiente de resolver',
};
export function ReceiptDetails({ receipt, site, onCheckout, checkoutEnabled = true }: { receipt: Receipt; site: Storefront; onCheckout?: () => void; checkoutEnabled?: boolean }) {
  const service = site.services.find(s => s.id === receipt.serviceId);
  const quote = { locale: site.locale, ...receipt.quote };
  const description = receipt.payment === 'none' && receipt.state === 'confirmed'
    ? 'El negocio registró tu cita en su agenda. No se realizó ningún cobro en línea.'
    : receipt.payment === 'none' && receipt.state === 'cancelled'
      ? 'El negocio registró la cancelación. No se realizó ningún cobro en línea.'
      : statusText[receipt.state][1];
  return <div className="receipt-details">
    <h2>{statusText[receipt.state][0]}</h2><p role="status">{description}</p>
    <dl><dt>Referencia</dt><dd>{receipt.reference}</dd><dt>Servicio</dt><dd>{service?.name ?? 'Servicio de tu cita'}</dd><dt>Fecha y hora · {site.branch.timeZone}</dt><dd>{formatAppointment(receipt.startsAt, site)}</dd><dt>Precio del servicio</dt><dd>{formatMoney(receipt.quote.priceMinor, quote)}</dd><dt>{receipt.payment === 'none' ? 'Pago' : 'Anticipo'}</dt><dd>{receipt.payment === 'none' ? 'Pendiente con el negocio · sin cobro en línea' : formatMoney(receipt.quote.depositMinor, quote)}</dd></dl>
    {receipt.payment === 'stripe-deposit' && <p role="status">{receipt.paymentStatus ? paymentText[receipt.paymentStatus] : 'Estado del anticipo por verificar.'}{receipt.state === 'pending_approval' && receipt.paymentStatus === 'paid' ? ' El pago no confirma la cita; falta la aprobación del negocio.' : ''}</p>}
    {receipt.refund && <div className="notice" aria-label="Estado del reembolso">
      <p>Reembolso del anticipo: {formatMoney(receipt.refund.amountMinor, quote)}.</p>
      <p>{receipt.refund.status === 'succeeded' ? 'El proveedor confirmó el reembolso. Tu banco puede tardar en reflejarlo.' : receipt.refund.status === 'failed' ? 'El reembolso no se completó. El negocio debe resolverlo; conserva tu referencia y actualiza el estado.' : 'El reembolso está en proceso. Todavía no se ha confirmado su devolución.'}</p>
    </div>}
    <p className="field-help">{notifications[receipt.notification]}</p>
    <p className="field-help">Condiciones aceptadas: {receipt.terms.text}</p>
    {receipt.checkout && <div className="notice"><p>El enlace de pago vence el {formatAppointment(receipt.checkout.expiresAt, site)}.</p>
      {Date.parse(receipt.checkout.expiresAt) > Date.now() ? checkoutEnabled && onCheckout ? <a className="app-tienda-btn-confirm payment-link" href={receipt.checkout.url} rel="noreferrer" onClick={event => { event.preventDefault(); onCheckout(); }}>Pagar anticipo en Stripe</a> : <p>Consulta el estado del anticipo antes de continuar al pago.</p> : <p>El enlace venció. Actualiza el estado antes de continuar.</p>}
    </div>}
  </div>;
}
const receiptOf = (value: Receipt) => value;
export function BookingReceipt({ api, site, token, initial, managementToken, autoCheckout = false }: { api: StorefrontApi; site: Storefront; token: string; initial?: Receipt; managementToken?: string; autoCheckout?: boolean }) {
  const read = useCallback((signal: AbortSignal) => api.status(site, token, signal), [api, site, token]);
  const { value: receipt, loading, error, verified, refresh } = useBookingStatus({ read, receiptOf, initial });
  const redirected = useRef(false), [checkoutError, setCheckoutError] = useState('');
  const checkout = useCallback(() => {
    if (!receipt || !verified || loading || error) return;
    try { handoffCheckout(receipt, { type: managementToken ? 'manage' : 'receipt', token: managementToken ?? token }, window); }
    catch { setCheckoutError('No pudimos abrir el pago. Conserva tu enlace privado y actualiza el estado para continuar.'); }
  }, [receipt, verified, loading, error, managementToken, token]);
  useEffect(() => {
    // Original create/replay is immutable. Reconcile first, so a lost create reply
    // cannot redirect a now-paid booking back to its original Checkout session.
    if (autoCheckout && !redirected.current && verified && !loading && !error && receipt) {
      redirected.current = true;
      if (receipt.state === 'awaiting_payment' && receipt.checkout && Date.parse(receipt.checkout.expiresAt) > Date.now()) checkout();
    }
  }, [autoCheckout, verified, loading, error, receipt, checkout]);
  return <section className="booking-status" aria-label="Estado de tu reserva" tabIndex={-1}>
    {receipt && <ReceiptDetails receipt={receipt} site={site} onCheckout={checkout} checkoutEnabled={verified && !loading && !error} />}
    {loading && <p role="status">Consultando el estado de tu reserva…</p>}
    {error && <p role="alert" className="form-error">{error}</p>}
    {checkoutError && <p role="alert" className="form-error">{checkoutError}</p>}
    <button className="secondary-button" type="button" disabled={loading} onClick={() => void refresh()}>Actualizar estado</button>
    {receipt?.payment !== 'none' && <p className="field-help">Volver de Stripe no confirma el pago. Este estado proviene del negocio.</p>}
  </section>;
}
