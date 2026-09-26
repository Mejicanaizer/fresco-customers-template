import { useEffect, useRef, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js/pure';
import type { StripeEmbeddedCheckout } from '@stripe/stripe-js';
import type { Receipt } from '../lib/contracts';

type Checkout = Extract<NonNullable<Receipt['checkout']>, { mode: 'embedded' }>;
/** Stripe owns payment inputs; only the authenticated owner API confirms the booking. */
export function EmbeddedPayment({ checkout, onComplete }: { checkout: Checkout; onComplete: () => void }) {
  const mount = useRef<HTMLDivElement>(null), completed = useRef(onComplete);
  completed.current = onComplete;
  const [error, setError] = useState(false), [ready, setReady] = useState(false), [retry, setRetry] = useState(0);
  const [expired, setExpired] = useState(() => Date.parse(checkout.expiresAt) <= Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function checkExpiry() {
      const delay = Date.parse(checkout.expiresAt) - Date.now();
      setExpired(delay <= 0);
      if (delay > 0) timer = setTimeout(checkExpiry, Math.min(delay, 2_147_483_647));
    }
    checkExpiry();
    return () => clearTimeout(timer);
  }, [checkout.expiresAt]);
  useEffect(() => {
    if (expired) return;
    let disposed = false, instance: StripeEmbeddedCheckout | undefined;
    setReady(false); setError(false);
    void (async () => {
      try {
        const stripe = await loadStripe(checkout.publishableKey);
        if (!stripe || disposed) { if (!disposed) setError(true); return; }
        const embedded = await stripe.createEmbeddedCheckoutPage({ fetchClientSecret: async () => checkout.clientSecret,
          onComplete: () => { if (!disposed) completed.current(); } });
        if (disposed) { embedded.destroy(); return; }
        instance = embedded;
        if (!mount.current) { embedded.destroy(); return; }
        embedded.mount(mount.current); setReady(true);
      } catch { if (!disposed) setError(true); }
    })();
    return () => { disposed = true; instance?.destroy(); };
  }, [checkout.clientSecret, checkout.publishableKey, expired, retry]);
  return <section className="embedded-payment" aria-label="Pago seguro del anticipo">
    {expired ? <p role="status">El tiempo para pagar venció. Actualiza el estado de tu reserva.</p> : <>
      {!ready && !error && <p role="status">Cargando pago seguro…</p>}
      {error && <div role="alert"><p>No pudimos cargar el pago. Tu reserva conserva su referencia; vuelve a intentarlo.</p>
        <button type="button" className="secondary-button" onClick={() => setRetry(value => value + 1)}>Reintentar pago</button></div>}
      <div ref={mount} />
    </>}
  </section>;
}
