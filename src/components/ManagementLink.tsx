import { useId, useState } from 'react';
import type { Receipt } from '../lib/contracts';
import { notifications } from './AppointmentPass';
import { Icon } from './StorefrontIcons';

/** Capabilities stay in memory and URL fragments. */
export function ManagementLink({ token, receipt }: { token: string; receipt?: Receipt }) {
  const [message, setMessage] = useState(''), id = useId();
  const url = `${window.location.origin}/reserva#manage=${encodeURIComponent(token)}`;
  async function copy() {
    try { await navigator.clipboard.writeText(url); setMessage('Enlace copiado. Guárdalo en un lugar privado.'); }
    catch { setMessage('No pudimos copiarlo automáticamente. Selecciona y copia el enlace del campo.'); }
  }
  return <div className="management-link" aria-label="Tu enlace privado">
    <h2><Icon name="link" />Guarda tu enlace privado</h2>
    <p>{receipt ? notifications[receipt.notification] : 'Con este enlace puedes consultar, cancelar o reprogramar tu cita.'} Quien lo tenga podrá gestionar esta reserva.</p>
    <label className="sr-only" htmlFor={id}>Enlace privado de esta cita</label>
    <div className="management-link-field"><input id={id} type="text" readOnly value={url} onFocus={event => event.currentTarget.select()} autoComplete="off" spellCheck={false} /><button type="button" onClick={() => void copy()} aria-label="Copiar enlace privado"><Icon name="copy" />Copiar enlace</button></div>
    {message && <p role="status">{message}</p>}
  </div>;
}
