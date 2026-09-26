import { ContractError, capability, stripeUrl } from './contracts.ts';
import type { Receipt } from './contracts.ts';
import type { GuestLink } from './api.ts';

/** A status read can change schedule/state, never the accepted quote or identity. */
export function assertReceiptContinuity(previous: Receipt | null, next: Receipt) {
  if (!previous) return;
  if (['siteId', 'reference', 'branchId', 'serviceId', 'payment'].some(key => previous[key as keyof Receipt] !== next[key as keyof Receipt]) ||
      next.bookingRevision < previous.bookingRevision ||
      JSON.stringify(next.quote) !== JSON.stringify(previous.quote) ||
      JSON.stringify(next.terms) !== JSON.stringify(previous.terms)) throw new ContractError();
  if (previous.paymentStatus && ['paid', 'refund_pending', 'refunded', 'refund_failed'].includes(previous.paymentStatus) &&
      next.paymentStatus && ['unpaid', 'processing'].includes(next.paymentStatus)) throw new ContractError();
}

export function shouldRefreshReceipt(receipt: Receipt | null): boolean {
  return !receipt || receipt.payment === 'stripe-deposit' && (
    ['awaiting_payment', 'payment_processing', 'pending_approval', 'payment_review'].includes(receipt.state) ||
    ['processing', 'refund_pending', 'refund_failed'].includes(receipt.paymentStatus ?? '') ||
    ['pending', 'failed'].includes(receipt.refund?.status ?? '')
  );
}

/** Preserve only the private return fragment before leaving. Never use storage/query strings. */
export function handoffCheckout(receipt: Receipt, link: GuestLink, navigation: {
  history: Pick<History, 'replaceState'>;
  location: Pick<Location, 'assign' | 'pathname'>;
}, now = Date.now()) {
  if (receipt.payment !== 'stripe-deposit' || receipt.state !== 'awaiting_payment' || !receipt.checkout || receipt.checkout.mode === 'embedded' || Date.parse(receipt.checkout.expiresAt) <= now ||
      receipt.refund || (receipt.paymentStatus && !['unpaid', 'processing'].includes(receipt.paymentStatus))) throw new ContractError();
  const url = stripeUrl(receipt.checkout.url), token = capability(link.token);
  navigation.history.replaceState(null, '', `/reserva/pago#${link.type}=${encodeURIComponent(token)}`);
  try { navigation.location.assign(url); }
  catch (error) {
    navigation.history.replaceState(null, '', navigation.location.pathname);
    throw error;
  }
}
