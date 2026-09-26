import { useCallback, useEffect, useState } from 'react';
import type { Receipt, Slot, Storefront } from '../lib/contracts';
import type { StorefrontApi } from '../lib/api';
import { handoffCheckout } from '../lib/payment';
import { useBookingStatus } from '../lib/useBookingStatus';
import { PaymentModal } from './PaymentModal';
import { ReceiptDetails, ReceiptTerms } from './AppointmentPass';
import { GuestManagement } from './GuestManagement';
import { ManagementLink } from './ManagementLink';

const receiptOf = (value: Receipt) => value;
export function BookingReceipt({ api, site, token, initial, managementToken, provider, onBrowse }: { api: StorefrontApi; site: Storefront; token: string; initial?: Receipt; managementToken?: string; provider?: Slot | null; onBrowse?: () => void }) {
  const [managing, setManaging] = useState(false);
  const read = useCallback((signal: AbortSignal) => api.status(site, token, signal), [api, site, token]);
  const { value: receipt, loading, error, verified, refresh } = useBookingStatus({ read, receiptOf, initial, paused: managing });
  const [checkoutError, setCheckoutError] = useState('');
  const checkout = useCallback(() => {
    if (!receipt || !verified || loading || error) return;
    try { handoffCheckout(receipt, { type: managementToken ? 'manage' : 'receipt', token: managementToken ?? token }, window); }
    catch { setCheckoutError('No pudimos abrir el pago. Conserva tu enlace privado y actualiza el estado para continuar.'); }
  }, [receipt, verified, loading, error, managementToken, token]);
  useEffect(() => { if (managementToken && verified && receipt?.state === 'confirmed') setManaging(true); }, [managementToken, verified, receipt]);
  if (managing && managementToken && receipt) return <GuestManagement api={api} site={site} token={managementToken} initialReceipt={receipt} provider={provider} onBrowse={onBrowse} refreshLabel="Actualizar estado" />;
  return <section className="booking-status" aria-label="Estado de tu reserva" tabIndex={-1}>
    {receipt && <ReceiptDetails receipt={receipt} site={site} hasManagement={!!managementToken} provider={provider} verified={verified} actionsEnabled={verified && !loading && !error} onCheckout={checkout} checkoutEnabled={verified && !loading && !error} />}
    {receipt?.checkout?.mode === 'embedded' && verified && receipt.state === 'awaiting_payment' && receipt.paymentStatus !== 'paid' &&
      <PaymentModal key={receipt.checkout.clientSecret} checkout={receipt.checkout} refresh={() => { void refresh(); }} loading={loading} error={error} />}
    {loading && <p role="status">Consultando el estado de tu reserva…</p>}
    {error && <p role="alert" className="form-error">{error}</p>}
    {checkoutError && <p role="alert" className="form-error">{checkoutError}</p>}
    {managementToken && <ManagementLink token={managementToken} receipt={receipt ?? undefined} />}
    <div className="receipt-bottom-row">{receipt && <ReceiptTerms receipt={receipt} />}
    <button className="text-button receipt-refresh" type="button" disabled={loading} onClick={() => void refresh()}>Actualizar estado</button></div>
    {onBrowse && <button type="button" className="text-button browse-services" onClick={onBrowse}>Ver otros servicios</button>}
  </section>;
}
