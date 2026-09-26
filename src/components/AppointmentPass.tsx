import type { PaymentStatus, Receipt, ReceiptState, Slot, Storefront } from '../lib/contracts';
import { formatAppointment, formatMoney } from '../lib/contracts';
import { appointmentCalendar } from '../lib/calendar-export';
import { PublicImage } from './StorefrontLayout';
import { Icon } from './StorefrontIcons';
import { ReceiptReference } from './ReceiptReference';

const statusText: Record<ReceiptState, [string, string]> = {
  awaiting_payment: ['Anticipo pendiente', 'Tu cita todavía no está confirmada. Completa el anticipo y consulta aquí el resultado verificado por el negocio.'],
  pending_approval: ['Solicitud recibida', 'El negocio revisará tu solicitud. El horario no está apartado y la cita todavía no está confirmada.'],
  payment_processing: ['Verificando el pago', 'El negocio está verificando el anticipo y la disponibilidad. Aún no hay una cita confirmada.'],
  confirmed: ['Tu cita está confirmada', 'El negocio registró tu cita en su agenda.'],
  payment_review: ['Pago en revisión', 'El negocio debe revisar el pago y la disponibilidad. Tu cita no está confirmada; conserva esta referencia y contacta al negocio.'],
  expired: ['La reserva venció', 'Este intento ya no tiene un horario apartado. Consulta al negocio si realizaste un pago.'],
  cancelled: ['Tu cita fue cancelada', 'El negocio registró la cancelación. El estado del anticipo se muestra por separado.'],
  declined: ['Solicitud no aprobada', 'El negocio no aprobó esta solicitud. Puedes consultar otras opciones con el negocio.'],
};
export const notifications: Record<Receipt['notification'], string> = {
  unconfigured: 'Las notificaciones automáticas por WhatsApp no están activas. Guarda tu enlace privado para consultar o cambiar tu cita.',
  not_sent: 'Todavía no se envió una notificación por WhatsApp.', queued: 'Notificación por WhatsApp en cola.',
  sent: 'Notificación enviada a WhatsApp; entrega pendiente de verificar.', delivered: 'Notificación entregada por WhatsApp.',
  failed: 'La notificación por WhatsApp no pudo entregarse. Contacta al negocio con tu referencia.',
};
const paymentText: Record<PaymentStatus, string> = {
  unpaid: 'Anticipo sin pagar', processing: 'Pago en verificación', paid: 'Anticipo pagado',
  refund_pending: 'Reembolso en proceso', refunded: 'Reembolso confirmado', refund_failed: 'Reembolso pendiente de resolver',
};
export function ReceiptDetails({ receipt, site, onCheckout, checkoutEnabled = true, provider, verified = true, actionsEnabled = verified, hasManagement = false }: { receipt: Receipt; site: Storefront; onCheckout?: () => void; checkoutEnabled?: boolean; provider?: Slot | null; verified?: boolean; actionsEnabled?: boolean; hasManagement?: boolean }) {
  const service = site.services.find(s => s.id === receipt.serviceId);
  const quote = { locale: site.locale, ...receipt.quote };
  const date = new Date(receipt.startsAt);
  const format = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(site.locale, { timeZone: site.branch.timeZone, ...options }).format(date);
  const time = new Intl.DateTimeFormat(site.locale, { timeZone: site.branch.timeZone, hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(date);
  const description = receipt.payment === 'none' && receipt.state === 'confirmed'
    ? 'El negocio registró tu cita en su agenda. No se realizó ningún cobro en línea.'
    : receipt.payment === 'none' && receipt.state === 'cancelled'
      ? 'El negocio registró la cancelación. No se realizó ningún cobro en línea.'
      : statusText[receipt.state][1];
  const tone = receipt.state === 'confirmed' ? 'confirmed' : ['cancelled', 'expired', 'declined'].includes(receipt.state) ? 'inactive' : 'pending';
  const chip = receipt.state === 'confirmed' ? 'Confirmada' : receipt.state === 'cancelled' ? 'Cancelada' : statusText[receipt.state][0];
  const paid = receipt.paymentStatus === 'paid';
  const showPass = verified && (receipt.state === 'cancelled' || (receipt.state === 'confirmed' && receipt.payment === 'none') || (paid && (receipt.state === 'confirmed' || receipt.state === 'pending_approval')));
  const canPay = receipt.state === 'awaiting_payment' && receipt.payment === 'stripe-deposit' && !paid;
  function calendar() {
    if (!showPass || !actionsEnabled) return;
    const contents = appointmentCalendar(receipt, site); if (!contents) return;
    const url = URL.createObjectURL(new Blob([contents], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'cita.ics'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="receipt-details">
    <div className="receipt-heading"><span className={`receipt-chip ${tone}`}><i />{chip}</span><h2>{statusText[receipt.state][0]}</h2><p role="status">{description}</p></div>
    {showPass ? <div className={`appointment-pass ${receipt.state === 'cancelled' ? 'is-cancelled' : ''}`}>
      <div className="pass-main">
        <div className="pass-brand"><PublicImage url={site.logoUrl} className="pass-logo" fallback={<span>{site.name.trim().slice(0, 1)}</span>} /><div><strong>{site.name}</strong><span>{site.branch.name}</span></div><span className="pass-label">Pase de cita</span></div>
        <div className="pass-date-time">
          <div><span className="pass-label">Fecha</span><strong>{format({ day: 'numeric', month: 'short' })}</strong><span>{format({ weekday: 'long', year: 'numeric' })}</span></div>
          <div><span className="pass-label">Hora</span><strong>{time.filter(part => part.type !== 'dayPeriod').map(part => part.value).join('').trim()} <small>{time.find(part => part.type === 'dayPeriod')?.value}</small></strong><span>hasta {new Intl.DateTimeFormat(site.locale, { timeZone: site.branch.timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(receipt.endsAt))} · {(Date.parse(receipt.endsAt) - Date.parse(receipt.startsAt)) / 60000} min</span></div>
        </div>
        <dl className="pass-info">
          <div className="pass-service"><dt>Servicio</dt><dd>{service?.name ?? 'Servicio de tu cita'}</dd></div>
          <div className="pass-provider"><dt>Atiende</dt><dd>{provider?.providerId === receipt.providerId ? provider.providerName : 'Asignado por el negocio'}</dd></div>
          <div><dt>{receipt.payment === 'none' ? 'Pago en línea' : 'Anticipo'}</dt><dd>{receipt.payment === 'none' ? 'Sin cobro en línea' : <>{formatMoney(receipt.quote.depositMinor, quote)}{paid && <span className="paid-badge" role={receipt.state === 'confirmed' ? 'status' : undefined} aria-label="Anticipo pagado"><Icon name="check" /><span className="sr-only">Anticipo </span><span>pagado</span></span>}</>}</dd></div>
          <div><dt>{receipt.state === 'confirmed' ? 'Pago en el negocio' : 'Precio del servicio'}</dt><dd>{formatMoney(receipt.quote.priceMinor - (receipt.state === 'confirmed' && paid ? receipt.quote.depositMinor : 0), quote)}</dd></div>
        </dl>
      </div>
      <div className="pass-bottom">
        <ReceiptReference reference={receipt.reference} barcode />
        <p>{receipt.state === 'confirmed' ? 'Muestra esta referencia al llegar' : 'Conserva esta referencia para consultar con el negocio'}</p>
      </div>
      {receipt.state === 'cancelled' && <span className="cancelled-stamp" aria-hidden="true">Cancelada</span>}
    </div> : <div className="payment-summary">
      <div className="payment-summary-title"><span>{receipt.state === 'pending_approval' ? 'Solicitud de cita' : 'Resumen de reserva'}</span><strong>{service?.name ?? 'Servicio de tu cita'}</strong><p>{site.name} · {site.branch.name}</p></div>
      <dl>
        <div><dt>Fecha y hora solicitadas</dt><dd>{formatAppointment(receipt.startsAt, site)}<small>{site.branch.timeZone}</small></dd></div>
        <div><dt>Precio del servicio</dt><dd>{formatMoney(receipt.quote.priceMinor, quote)}</dd></div>
        <div><dt>{receipt.payment === 'none' ? 'Pago en línea' : paid ? 'Anticipo pagado' : 'Anticipo'}</dt><dd>{receipt.payment === 'none' ? 'Sin cobro en línea' : formatMoney(receipt.quote.depositMinor, quote)}</dd></div>
      </dl>
      <div className="payment-summary-reference"><span>Referencia de la reserva</span><ReceiptReference reference={receipt.reference} /></div>
    </div>}
    {receipt.payment === 'stripe-deposit' && !(paid && receipt.state === 'confirmed') && <p className="receipt-payment-state" role="status">{receipt.paymentStatus ? paymentText[receipt.paymentStatus] : 'Estado del anticipo por verificar.'}{receipt.state === 'pending_approval' && paid ? ' El pago no confirma la cita; falta la aprobación del negocio.' : ''}</p>}
    {receipt.refund && <div className="notice" aria-label="Estado del reembolso">
      <p>Reembolso del anticipo: {formatMoney(receipt.refund.amountMinor, quote)}.</p>
      <p>{receipt.refund.status === 'succeeded' ? 'El proveedor confirmó el reembolso. Tu banco puede tardar en reflejarlo.' : receipt.refund.status === 'failed' ? 'El reembolso no se completó. El negocio debe resolverlo; conserva tu referencia y actualiza el estado.' : 'El reembolso está en proceso. Todavía no se ha confirmado su devolución.'}</p>
    </div>}
    {showPass && receipt.state === 'confirmed' && <button type="button" className="calendar-export secondary-button" disabled={!actionsEnabled} onClick={calendar}><Icon name="calendar" />Agregar al calendario</button>}
    {!hasManagement && <p className="field-help notification-state">{notifications[receipt.notification]}</p>}
    {canPay && receipt.checkout && receipt.checkout.mode !== 'embedded' && <div className="notice"><p>El enlace de pago vence el {formatAppointment(receipt.checkout.expiresAt, site)}.</p>
      {Date.parse(receipt.checkout.expiresAt) > Date.now() ? checkoutEnabled && onCheckout ? <a className="app-tienda-btn-confirm payment-link" href={receipt.checkout.url} rel="noreferrer" onClick={event => { event.preventDefault(); onCheckout(); }}>Pagar anticipo en Stripe</a> : <p>Consulta el estado del anticipo antes de continuar al pago.</p> : <p>El enlace venció. Actualiza el estado antes de continuar.</p>}
    </div>}
  </div>;
}
export function ReceiptTerms({ receipt }: { receipt: Receipt }) {
  return <details className="receipt-terms"><summary>Ver condiciones aceptadas</summary><p>Condiciones aceptadas: {receipt.terms.text}</p></details>;
}
