import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { formatMoney, parseBookingInput } from '../lib/contracts';
import type { BookingInput, BookingResult, PublicService, Slot, Storefront } from '../lib/contracts';
import { bookingAttempt, StorefrontError } from '../lib/api';
import type { Attempt, StorefrontApi } from '../lib/api';
import { SlotPicker } from './SlotPicker';
import { PublicImage } from './StorefrontLayout';
import { Icon } from './StorefrontIcons';
import { BookingDrawer } from './BookingDrawer';

export function BookingDialog({ open, site, service, api, onClose, onBooked, onReload }: { open: boolean; site: Storefront; service: PublicService; api: StorefrontApi; onClose: () => void; onBooked: (result: BookingResult, slot: Slot) => void; onReload: () => void }) {
  const prefix = useId();
  const attempt = useRef<Attempt | null>(null), pending = useRef(false);
  const [slot, setSlot] = useState<Slot | null>(null), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState(''), [refresh, setRefresh] = useState(0);
  const [frozen, setFrozen] = useState<{ input: BookingInput; slot: Slot } | null>(null);
  const [configurationChanged, setConfigurationChanged] = useState(false);
  const [contactReady, setContactReady] = useState(false);
  useEffect(() => {
    if (!busy && !uncertain) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [busy, uncertain]);
  async function send(input: BookingInput, chosen: Slot) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      attempt.current = bookingAttempt(attempt.current, input); setFrozen({ input, slot: chosen });
      onBooked(await api.book(site, input, attempt.current.key, chosen), chosen);
    }
    catch (error) {
      const ambiguous = !(error instanceof StorefrontError) || error.uncertain;
      setUncertain(ambiguous);
      setError(error instanceof Error ? error.message : 'No pudimos verificar el resultado.');
      if (error instanceof StorefrontError && error.code === 'slot_unavailable') { setSlot(null); setRefresh(x => x + 1); }
      if (error instanceof StorefrontError && error.code === 'configuration_changed') setConfigurationChanged(true);
    } finally { pending.current = false; setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (uncertain || busy || configurationChanged || !slot || !site.booking.ready || (site.booking.payment === 'stripe-deposit' && service.depositMinor === null)) return;
    const f = new FormData(event.currentTarget), value = (name: string) => String(f.get(name) ?? '').trim();
    const nationalPhone = String(f.get('whatsapp') ?? '');
    if (!/^[0-9]{10}$/.test(nationalPhone)) {
      setError('Escribe exactamente 10 dígitos en el teléfono, sin código de país, espacios ni guiones.');
      return;
    }
    try {
      const input = parseBookingInput({ revision: site.revision, expectedMode: site.booking.mode, serviceId: service.id, slotId: slot.id,
        guest: { name: value('name'), whatsapp: `+52${nationalPhone}` }, notes: value('notes'),
        pet: site.capabilities.grooming ? { name: value('petName'), sizeId: value('sizeId') || null, breed: value('breed').trim() || null, ageMonths: value('ageMonths') === '' ? null : Number(value('ageMonths')), behaviorNotes: value('behaviorNotes'), groomingPreferences: value('groomingPreferences'), photoUploadId: null } : null });
      void send(input, slot);
    } catch { setError('Revisa los datos. Usa tu nombre completo y un teléfono de exactamente 10 dígitos.'); }
  }
  const field = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => <div className="app-tienda-field-group"><label htmlFor={`${prefix}-${name}`}>{label}</label><input id={`${prefix}-${name}`} name={name} className="app-tienda-input" {...props} /></div>;
  return <BookingDrawer open={open} locked={busy || uncertain} title="Tu reserva" subtitle={`Un servicio${site.capabilities.grooming ? ' · una mascota' : ''} · Sin crear una cuenta`} closeLabel="Cerrar reserva" onClose={onClose}>
    <form className="booking-form" onSubmit={submit} onInput={event => {
      const fields = new FormData(event.currentTarget);
      setContactReady(String(fields.get('name') ?? '').trim().length >= 2 && /^[0-9]{10}$/.test(String(fields.get('whatsapp') ?? '')) && (!site.capabilities.grooming || !!String(fields.get('petName') ?? '').trim()));
    }}>
      <div className="drawer-body">
        <div className="drawer-service"><PublicImage url={service.imageUrl} className="drawer-service-image" fallback={<Icon name="service" />} /><div><h3>{service.name}</h3><p>{formatMoney(service.priceMinor, site)} <span>· {service.durationMinutes} min</span></p></div><button className="text-button" type="button" disabled={busy || uncertain} onClick={onClose}>Cambiar</button></div>
        <SlotPicker site={site} api={api} serviceId={service.id} selected={slot} onSelect={setSlot} disabled={busy || uncertain || configurationChanged} refresh={refresh} />
        <fieldset className="booking-fields" disabled={busy || uncertain || configurationChanged}><legend><span className={`step-number ${contactReady ? 'is-complete' : ''}`}>2</span>Tus datos de contacto</legend>
          {field('name', 'Nombre completo', { autoComplete: 'name', placeholder: 'Tu nombre y apellido', minLength: 2, maxLength: 120, required: true })}
          <div className="phone-field"><span className="phone-prefix" aria-hidden="true">+52</span>{field('whatsapp', 'Teléfono (10 dígitos)', {
            type: 'tel', inputMode: 'numeric', autoComplete: 'tel-national', placeholder: '5512345678', pattern: '[0-9]{10}', required: true,
            'aria-describedby': `${prefix}-phone-help`,
            onInvalid: event => event.currentTarget.setCustomValidity('Escribe exactamente 10 dígitos, sin código de país, espacios ni guiones.'),
            onInput: event => event.currentTarget.setCustomValidity(''),
          })}</div>
          <p className="field-help" id={`${prefix}-phone-help`}>10 dígitos, sin código de país, espacios ni guiones.</p>
          <p className="field-help">{site.booking.notifications === 'whatsapp' ? 'Aquí podrás recibir las novedades de tu cita.' : 'El negocio puede contactarte a este número. Guarda tu enlace privado al confirmar.'}</p>
        </fieldset>
        {site.capabilities.grooming && <fieldset className="booking-fields" disabled={busy || uncertain || configurationChanged}><legend><span className="step-number">3</span>Tu mascota</legend>
          {field('petName', 'Nombre de la mascota', { placeholder: '¿Cómo se llama?', maxLength: 100, required: true })}
          <div className="app-tienda-field-group"><label htmlFor={`${prefix}-size`}>Tamaño (opcional)</label><select className="app-tienda-select" name="sizeId" id={`${prefix}-size`} defaultValue=""><option value="">No lo sé / indicar después</option>{site.capabilities.grooming.sizes.map(size => <option key={size.id} value={size.id}>{size.label}</option>)}</select></div>
          <div className="form-row">{field('breed', 'Raza o cruza (opcional)', { maxLength: 100 })}{field('ageMonths', 'Edad en meses (opcional)', { type: 'number', min: 0, max: 600, step: 1 })}</div>
          <details className="form-details"><summary>Cuidados y preferencias (opcional)</summary><div>
            <label htmlFor={`${prefix}-behavior`}>Comportamiento y cuidados</label><textarea className="app-tienda-textarea" id={`${prefix}-behavior`} name="behaviorNotes" maxLength={2000} />
            <label htmlFor={`${prefix}-preferences`}>Preferencias de grooming</label><textarea className="app-tienda-textarea" id={`${prefix}-preferences`} name="groomingPreferences" maxLength={2000} />
          </div></details>
        </fieldset>}
        <fieldset className="booking-fields booking-notes" disabled={busy || uncertain || configurationChanged}><label htmlFor={`${prefix}-notes`}>Notas para el negocio (opcional)</label><textarea id={`${prefix}-notes`} name="notes" className="app-tienda-textarea" rows={2} placeholder="Algo que debamos tener en cuenta para tu cita…" maxLength={2000} /></fieldset>
        <div className="booking-terms"><p><Icon name="check" /><span>Puedes solicitar cambios desde tu enlace privado hasta 24 horas antes. El negocio valida las opciones disponibles.</span></p>{site.booking.mode === 'approval' && <p><Icon name="check" /><span>{site.booking.payment === 'stripe-deposit' ? 'Pagas el anticipo al enviar la solicitud. ' : ''}La solicitud requiere aprobación y no aparta el horario.</span></p>}<details><summary>Ver condiciones completas</summary><p>{site.booking.depositTerms}</p></details></div>
        {error && <p className="form-error" role="alert">{error}</p>}
        {configurationChanged && <button className="secondary-button" type="button" disabled={busy} onClick={onReload}>Actualizar condiciones y reiniciar solicitud</button>}
        {uncertain && <div className="notice" role="status"><p>No sabemos si el negocio recibió la solicitud. Conservamos los mismos datos y la misma referencia de envío para recuperar su resultado sin crear otra reserva.</p></div>}
      </div>
      <footer className="drawer-footer">
        <div className="booking-total"><span>Precio del servicio</span><strong>{formatMoney(service.priceMinor, site)}</strong></div>
        <div className="booking-total"><span>Pagas en el local</span><strong>{formatMoney(service.priceMinor - (site.booking.payment === 'none' ? 0 : service.depositMinor ?? 0), site)}</strong></div>
        <div className="booking-total today-total"><span>{site.booking.payment === 'none' ? 'Sin pago en línea' : 'Pagas hoy (anticipo)'}</span><strong>{service.depositMinor === null && site.booking.payment !== 'none' ? 'Por configurar' : formatMoney(site.booking.payment === 'none' ? 0 : service.depositMinor!, site)}</strong></div>
        {uncertain ? <button className="app-tienda-btn-confirm" type="button" disabled={busy} onClick={() => frozen && void send(frozen.input, frozen.slot)}>{busy ? 'Recuperando…' : 'Recuperar resultado'}</button>
          : <button className="app-tienda-btn-confirm" disabled={busy || configurationChanged || !slot || !contactReady || !site.booking.ready || (site.booking.payment === 'stripe-deposit' && service.depositMinor === null)} type="submit">{busy ? 'Enviando…' : !slot ? 'Elige un horario' : !contactReady ? 'Completa tus datos' : site.booking.payment === 'stripe-deposit' ? `Pagar anticipo · ${formatMoney(service.depositMinor!, site)}` : site.booking.mode === 'approval' ? 'Enviar solicitud de cita' : 'Confirmar cita sin pago en línea'}</button>}
      </footer>
    </form>
  </BookingDrawer>;
}
