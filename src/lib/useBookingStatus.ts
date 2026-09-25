import { useCallback, useEffect, useRef, useState } from 'react';
import { StorefrontError } from './api';
import { ContractError } from './contracts';
import type { Receipt } from './contracts';
import { assertReceiptContinuity, shouldRefreshReceipt } from './payment';

/** Bounded reconciliation, with stale-response protection around guest mutations. */
export function useBookingStatus<T>({ read, receiptOf, initial = null, paused = false }: {
  read: (signal: AbortSignal) => Promise<T>; receiptOf: (value: T) => Receipt;
  initial?: T | null; paused?: boolean;
}) {
  const [value, setValue] = useState<T | null>(initial), [loading, setLoading] = useState(false);
  const [error, setError] = useState(''), [verified, setVerified] = useState(false);
  const current = useRef(initial), generation = useRef(0), controller = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), remaining = useRef(12);
  const stop = useCallback(() => {
    generation.current++;
    controller.current?.abort(); controller.current = null;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const replace = useCallback((next: T) => {
    assertReceiptContinuity(current.current ? receiptOf(current.current) : null, receiptOf(next));
    stop(); current.current = next; setValue(next); setVerified(true); setLoading(false); setError('');
  }, [receiptOf, stop]);
  const refresh = useCallback(async (automatic = false) => {
    if (paused || controller.current) return;
    if (!automatic) remaining.current = 12;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    const request = new AbortController(), epoch = generation.current;
    controller.current = request; setLoading(true); setError('');
    let retryable = true;
    try {
      const next = await read(request.signal);
      if (request.signal.aborted || epoch !== generation.current) return;
      assertReceiptContinuity(current.current ? receiptOf(current.current) : null, receiptOf(next));
      current.current = next; setValue(next); setVerified(true);
    } catch (e) {
      if (request.signal.aborted || epoch !== generation.current) return;
      setError(e instanceof ContractError ? 'No pudimos validar el estado de tu reserva. Vuelve a consultar.' : e instanceof Error ? e.message : 'No pudimos consultar tu reserva.');
      retryable = !(e instanceof StorefrontError && e.code === 'link_invalid');
    } finally {
      if (!request.signal.aborted && epoch === generation.current) {
        controller.current = null; setLoading(false);
        if (retryable && remaining.current-- > 0 && shouldRefreshReceipt(current.current ? receiptOf(current.current) : null)) {
          timer.current = setTimeout(() => { void refresh(true); }, 5000);
        }
      }
    }
  }, [paused, read, receiptOf]);
  useEffect(() => {
    if (paused) return;
    void refresh();
    const resume = () => { if (document.visibilityState !== 'hidden') void refresh(); };
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) window.history.replaceState(null, '', window.location.pathname);
      resume();
    };
    // Stripe returns and restored back/forward pages still require an owner POST.
    window.addEventListener('focus', resume); window.addEventListener('online', resume);
    window.addEventListener('pageshow', restored); document.addEventListener('visibilitychange', resume);
    return () => {
      stop();
      window.removeEventListener('focus', resume); window.removeEventListener('online', resume);
      window.removeEventListener('pageshow', restored); document.removeEventListener('visibilitychange', resume);
    };
  }, [paused, refresh, stop]);
  return { value, loading, error, verified, refresh, replace };
}
