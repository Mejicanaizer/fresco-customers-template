import { useEffect, useId, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { Icon } from './StorefrontIcons';

export function BookingDrawer({ open, locked, title, subtitle, closeLabel, onClose, children, presentation = 'drawer', returnFocus }: { open: boolean; locked: boolean; title: string; subtitle: string; closeLabel: string; onClose: () => void; children: ReactNode; presentation?: 'drawer' | 'payment'; returnFocus?: RefObject<HTMLElement | null> }) {
  const dialog = useRef<HTMLDialogElement>(null), id = useId();
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow, element = dialog.current;
    document.body.style.overflow = 'hidden'; element?.showModal();
    return () => { element?.close(); document.body.style.overflow = overflow; const target = returnFocus?.current ?? previous; if (target?.isConnected) target.focus({ preventScroll: true }); };
  }, [open, returnFocus]);
  return <dialog ref={dialog} className={`booking-dialog ${presentation === 'payment' ? 'payment-dialog' : ''}`} aria-labelledby={id} onClick={event => {
    if (event.target !== event.currentTarget || locked) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
  }} onKeyDown={event => {
    // Native dialog navigation includes the payment iframe's own tab order.
    if (presentation === 'payment' || event.key !== 'Tab') return;
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, a[href]')].filter(element => element.getClientRects().length && element.tabIndex >= 0);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }} onCancel={event => { event.preventDefault(); if (!locked) onClose(); }}>
    <header className="drawer-header"><div><h2 id={id}>{title}</h2><p>{subtitle}</p></div><button className="icon-button" type="button" disabled={locked} onClick={onClose} aria-label={closeLabel}><Icon name="close" /></button></header>
    {children}
  </dialog>;
}
