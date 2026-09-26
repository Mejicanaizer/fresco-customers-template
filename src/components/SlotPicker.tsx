import { useEffect, useState } from 'react';
import type { Slot, Storefront } from '../lib/contracts';
import { dateInZone, formatAppointment, formatTime } from '../lib/contracts';
import type { StorefrontApi } from '../lib/api';
import { BookingCalendar } from './BookingCalendar';
import { Icon } from './StorefrontIcons';

export function SlotPicker({ site, serviceId, api, selected, onSelect, disabled = false, refresh = 0 }: {
  site: Storefront; serviceId: string; api: StorefrontApi; selected: Slot | null; onSelect: (slot: Slot | null) => void; disabled?: boolean; refresh?: number;
}) {
  const [date, setDate] = useState(site.booking.firstDate);
  const [result, setResult] = useState<{ date: string; slots: Slot[] } | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [knownDates, setKnownDates] = useState<Record<string, boolean>>({});
  useEffect(() => { setKnownDates({}); }, [site, serviceId, refresh]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setResult(null);
    api.availability(site, serviceId, date, controller.signal).then(data => {
      if (!controller.signal.aborted) { setResult({ date, slots: data.slots }); setKnownDates(previous => ({ ...previous, [date]: data.slots.length > 0 })); }
    }).catch((error: Error) => { if (!controller.signal.aborted) setError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [site, serviceId, date, api, retry, refresh]);
  const slots = result?.date === date ? result.slots : [];
  const hour = (slot: Slot) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: site.branch.timeZone, hour: '2-digit', hourCycle: 'h23' }).format(new Date(slot.startsAt)));
  const providers = [...new Map(slots.map(slot => [slot.providerId, slot.providerName])).entries()];
  const groups = [{ label: 'Mañana', from: 0, to: 12 }, { label: 'Tarde', from: 12, to: 17 }, { label: 'Noche', from: 17, to: 24 }];
  return <fieldset className="booking-fields slot-picker" disabled={disabled}>
    <legend><span className={`step-number ${selected ? 'is-complete' : ''}`}>1</span>Fecha y hora</legend>
    <div className="calendar-shell">
    <BookingCalendar availability={knownDates} date={date} min={site.booking.firstDate} max={site.booking.lastDate} locale={site.locale} today={dateInZone(new Date().toISOString(), site.branch.timeZone)} onChange={value => { onSelect(null); setDate(value); }} />
    <div className="slot-options" aria-label="Horario y profesional" role="group" aria-busy={loading}>
      <p className="slots-label">Horarios · {new Intl.DateTimeFormat(site.locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))}</p>
      <p className="field-help">Hora de {site.branch.name} · {site.branch.timeZone}</p>
      {loading && <p className="availability-message" role="status">Consultando la agenda…</p>}
      {error && <div role="alert" className="form-error"><p>{error}</p><button type="button" className="secondary-button" onClick={() => { onSelect(null); setRetry(x => x + 1); }}>Reintentar horarios</button></div>}
      {!loading && !error && slots.length === 0 && <p className="availability-message" role="status">No hay horarios disponibles para esta fecha. Elige otra fecha.</p>}
      {!loading && !error && providers.map(([providerId, providerName]) => <div className="provider-slots" key={providerId}><p className="provider-name">{providerName}</p>{groups.map(group => {
        const choices = slots.filter(slot => slot.providerId === providerId && hour(slot) >= group.from && hour(slot) < group.to);
        return choices.length > 0 && <div className="time-group" key={group.label}><h4>{group.label}</h4><div className="time-buttons">{choices.map(slot => <button type="button" className="time-button" key={slot.id} data-slot-id={slot.id} aria-pressed={selected?.id === slot.id} aria-label={`${formatTime(slot.startsAt, site)} – ${formatTime(slot.endsAt, site)} · ${slot.providerName}`} onClick={() => onSelect(slot)}>{new Intl.DateTimeFormat(site.locale, { timeZone: site.branch.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(slot.startsAt))}</button>)}</div></div>;
      })}</div>)}
      {selected && !loading && !error && <p className="selected-slot" role="status"><Icon name="clock" /><span>Horario elegido: {formatAppointment(selected.startsAt, site)} · {selected.providerName}</span></p>}
    </div>
    </div>
  </fieldset>;
}
