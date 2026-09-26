import type { Receipt, Storefront } from './contracts.ts';

const escapeText = (value: string) => value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
const instant = (value: string) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
/** Fold on UTF-8 boundaries: calendar content lines are at most 75 octets. */
function fold(line: string) {
  const encoder = new TextEncoder(); let current = '', length = 0; const lines: string[] = [];
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (length + size > 75) { lines.push(current); current = ' '; length = 1; }
    current += character; length += size;
  }
  lines.push(current); return lines.join('\r\n');
}
/** Only public appointment facts; no guest details or private management capability. */
export function appointmentCalendar(receipt: Receipt, site: Storefront, now = new Date()): string | null {
  if (receipt.state !== 'confirmed') return null;
  const service = site.services.find(value => value.id === receipt.serviceId)?.name ?? 'Servicio de tu cita';
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Fresco//Reservas//ES', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${encodeURIComponent(site.siteId)}-${encodeURIComponent(receipt.reference)}@fresco`,
    `DTSTAMP:${instant(now.toISOString())}`, `DTSTART:${instant(receipt.startsAt)}`, `DTEND:${instant(receipt.endsAt)}`,
    `SUMMARY:${escapeText(`${service} · ${site.name}`)}`, `LOCATION:${escapeText(site.contact.address || site.branch.name)}`,
    `DESCRIPTION:${escapeText(`Referencia: ${receipt.reference}`)}`, 'STATUS:CONFIRMED', 'END:VEVENT', 'END:VCALENDAR', '',
  ].map(fold).join('\r\n');
}
