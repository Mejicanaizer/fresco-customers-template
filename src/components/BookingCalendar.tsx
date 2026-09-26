import { useId, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Icon } from './StorefrontIcons';

const iso = (date: Date) => date.toISOString().slice(0, 10);
const utc = (date: string) => new Date(`${date}T00:00:00Z`);
export function shiftDate(date: string, days: number) { const next = utc(date); next.setUTCDate(next.getUTCDate() + days); return iso(next); }
function shiftMonth(month: string, step: number) { const next = utc(`${month}-01`); next.setUTCMonth(next.getUTCMonth() + step); return iso(next).slice(0, 7); }
const clamp = (date: string, min: string, max: string) => date < min ? min : date > max ? max : date;

/** Calendar days navigate the published booking window; only the API supplies available times. */
export function BookingCalendar({ date, min, max, locale, today, availability = {}, onChange }: { date: string; min: string; max: string; locale: string; today: string; availability?: Record<string, boolean>; onChange: (date: string) => void }) {
  const [month, setMonth] = useState(date.slice(0, 7)), [focusDate, setFocusDate] = useState(date);
  const id = useId();
  const first = `${month}-01`, offset = (utc(first).getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
  const days = Array.from({ length: Math.ceil((count + offset) / 7) * 7 }, (_, i) => shiftDate(first, i - offset));
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(utc(first));
  const dayLabel = (value: string) => new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(utc(value));
  function navigate(step: number) {
    const next = shiftMonth(month, step);
    setMonth(next); setFocusDate(clamp(`${next}-01`, min, max));
  }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>, value: string) {
    const delta: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -((utc(value).getUTCDay() + 6) % 7), End: 6 - ((utc(value).getUTCDay() + 6) % 7) };
    let target: string;
    if (event.key in delta) target = shiftDate(value, delta[event.key]);
    else if (event.key === 'PageUp' || event.key === 'PageDown') target = `${shiftMonth(value.slice(0, 7), event.key === 'PageUp' ? -1 : 1)}-01`;
    else return;
    event.preventDefault(); target = clamp(target, min, max);
    setFocusDate(target); setMonth(target.slice(0, 7));
    requestAnimationFrame(() => document.getElementById(`${id}-${target}`)?.focus());
  }
  return <div className="booking-calendar" role="group" aria-label="Fecha de tu cita">
    <div className="calendar-header"><h3 id={`${id}-month`} aria-live="polite">{monthName}</h3><div className="calendar-nav">
      <button type="button" className="icon-button calendar-prev" aria-label="Mes anterior" disabled={month <= min.slice(0, 7)} onClick={() => navigate(-1)}><Icon name="chevron" /></button>
      <button type="button" className="icon-button" aria-label="Mes siguiente" disabled={month >= max.slice(0, 7)} onClick={() => navigate(1)}><Icon name="chevron" /></button>
    </div></div>
    <div className="calendar-weekdays" aria-hidden="true">{['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, i) => <span key={i}>{day}</span>)}</div>
    <div className="calendar-days" role="group" aria-labelledby={`${id}-month`}>
      {days.map(value => <button id={`${id}-${value}`} key={value} type="button" data-date={value} className={`calendar-day ${value.slice(0, 7) !== month ? 'outside-month' : ''}`} aria-label={dayLabel(value)} aria-pressed={value === date} aria-current={value === today ? 'date' : undefined} disabled={value < min || value > max || value.slice(0, 7) !== month} tabIndex={value === focusDate ? 0 : -1} onKeyDown={e => keyboard(e, value)} onFocus={() => setFocusDate(value)} onClick={() => { setMonth(value.slice(0, 7)); setFocusDate(value); onChange(value); }}>{Number(value.slice(-2))}{availability[value] !== undefined && <span aria-hidden="true" className={`availability-dot ${availability[value] ? 'has-slots' : 'no-slots'}`} />}</button>)}
    </div>
    <div className="calendar-legend" aria-label="Disponibilidad de las fechas consultadas"><span><i className="has-slots" />Con horarios</span><span><i className="no-slots" />Sin disponibilidad</span></div>
  </div>;
}
