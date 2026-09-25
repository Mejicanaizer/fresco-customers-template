import { useState } from 'react';

/** Display only after create. Capabilities stay in memory and URL fragments. */
export function ManagementLink({ token, onManage }: { token: string; onManage?: () => void }) {
  const [message, setMessage] = useState('');
  const url = `${window.location.origin}/reserva#manage=${encodeURIComponent(token)}`;
  async function copy() {
    try { await navigator.clipboard.writeText(url); setMessage('Enlace copiado. Guárdalo en un lugar privado.'); }
    catch { setMessage('No pudimos copiarlo automáticamente. Selecciona y copia el enlace del campo.'); }
  }
  return <div className="notice" aria-label="Tu enlace privado">
    <h2>Guarda tu enlace privado</h2>
    <p>Necesitas este enlace para consultar, cancelar o reprogramar tu cita. Quien lo tenga podrá gestionar esta reserva.</p>
    <label htmlFor="management-link">Enlace privado de esta cita</label>
    <input id="management-link" className="app-tienda-input" type="text" readOnly value={url} onFocus={event => event.currentTarget.select()} autoComplete="off" spellCheck={false} />
    <div className="button-row"><button type="button" className="secondary-button" onClick={() => void copy()}>Copiar enlace privado</button>{onManage && <button type="button" className="secondary-button" onClick={onManage}>Gestionar esta cita</button>}</div>
    {message && <p role="status">{message}</p>}
  </div>;
}
