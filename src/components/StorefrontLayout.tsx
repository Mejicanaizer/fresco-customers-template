import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { PublicService, ReadinessReason, Storefront } from '../lib/contracts';
import { formatMoney } from '../lib/contracts';
import { Icon } from './StorefrontIcons';

export const readinessMessages: Record<ReadinessReason, string> = {
  deposit_not_configured: 'El negocio todavía debe configurar el anticipo.',
  payments_unavailable: 'El pago de anticipos no está disponible por ahora.',
  notifications_unavailable: 'Las notificaciones de reserva por WhatsApp aún no están disponibles.',
  policy_unconfigured: 'El negocio todavía debe configurar las condiciones de reserva y anticipo.',
  owner_unavailable: 'La agenda del negocio no está disponible por ahora.',
};
/** Broken or absent public media keeps the same layout without invented business imagery. */
export function PublicImage({ url, className, fallback, eager = false }: { url?: string | null; className: string; fallback?: ReactNode; eager?: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return url && failedUrl !== url
    ? <img src={url} alt="" className={className} loading={eager ? 'eager' : 'lazy'} onError={() => setFailedUrl(url)} />
    : <div className={`${className} public-image-fallback`} aria-hidden="true">{fallback}</div>;
}
export function StorefrontLayout({ site, children, illustrativeMedia = false }: { site: Storefront; children: ReactNode; illustrativeMedia?: boolean }) {
  const style = { '--fs-brand': site.theme.accent, '--fs-brand-text': site.theme.accentText } as CSSProperties;
  return <div className="app-tienda-page" style={style}>
    <a className="skip-link" href="#contenido">Ir al contenido</a>
    <header className="storefront-hero">
      <PublicImage url={site.coverImageUrl} className="storefront-cover" eager />
      <div className="storefront-hero-shade" />
      <div className="storefront-identity storefront-container">
        <PublicImage url={site.logoUrl} className="store-logo" eager fallback={<span>{site.name.trim().slice(0, 1)}</span>} />
        <div className="storefront-identity-copy">
          <h1>{site.name}</h1>
          <p className="storefront-description">{site.description}</p>
          <div className="storefront-contact">
            {site.contact.address && <span><Icon name="pin" />{site.contact.address}</span>}
            {site.contact.phone && <a href={`tel:${site.contact.phone}`}><Icon name="phone" />{site.contact.phone}</a>}
            {site.contact.whatsapp && <a href={`https://wa.me/${site.contact.whatsapp}`} target="_blank" rel="noopener noreferrer">Contactar por WhatsApp<Icon name="chevron" /></a>}
          </div>
        </div>
      </div>
    </header>
    {children}
    {illustrativeMedia && <p className="preview-media-note storefront-container">Vista previa local · Imágenes ilustrativas</p>}
    <footer className="app-tienda-footer storefront-container">
      <div><strong>{site.name}</strong><p>{site.branch.name} · Reserva como invitado.</p></div>
      <p>{site.booking.notifications === 'none'
        ? 'Guarda el enlace privado que aparece al reservar para gestionar tu cita.'
        : 'Tu enlace privado aparece al reservar. Consulta ahí el estado de tu notificación por WhatsApp.'}</p>
      <span className="storefront-credit">Hecho con Fresco</span>
    </footer>
  </div>;
}
export function ServiceCard({ service, site, selected = false, onBook }: { service: PublicService; site: Storefront; selected?: boolean; onBook: () => void }) {
  return <article className={`app-tienda-card ${selected ? 'is-selected' : ''}`}>
    <div className="app-tienda-card-media">
      <PublicImage url={service.imageUrl} className="app-tienda-card-img" fallback={<Icon name="service" />} />
      <div className="app-tienda-card-tags"><span className="app-tienda-badge badge-service">Servicio</span><span className="app-tienda-badge badge-duration"><Icon name="clock" /><span>{service.durationMinutes} <span className="duration-long">minutos</span><span className="duration-short" aria-hidden="true">min</span></span></span></div>
    </div>
    <div className="app-tienda-card-body">
      <span className="app-tienda-card-cat">{service.category}</span>
      <h3 className="app-tienda-card-title">{service.name}</h3>
      <p className="app-tienda-card-desc">{service.description}</p>
      <div className="app-tienda-card-footer">
        <div><strong className="app-tienda-amount">{formatMoney(service.priceMinor, site)}</strong>{site.booking.payment === 'stripe-deposit' && <p className="deposit-caption">{service.depositMinor === null ? 'Anticipo por configurar' : `Anticipo: ${formatMoney(service.depositMinor, site)}`}</p>}</div>
        <button className="app-tienda-action-btn" type="button" aria-pressed={selected} disabled={!site.booking.ready || (site.booking.payment === 'stripe-deposit' && service.depositMinor === null)} onClick={onBook} aria-label={`Agendar ${service.name}`}><Icon name={selected ? 'check' : 'plus'} />{selected ? 'Seleccionado' : 'Agregar'}</button>
      </div>
    </div>
  </article>;
}
export function ReservationSummary({ site, service, onOpen, onRemove }: { site: Storefront; service: PublicService; onOpen: () => void; onRemove: () => void }) {
  return <aside className="reservation-summary" aria-label="Resumen de tu reserva">
    <span className="reservation-count" aria-label="Un servicio seleccionado">1</span>
    <div className="reservation-summary-price"><span className="reservation-summary-name">{service.name}</span><strong>{formatMoney(service.priceMinor, site)}</strong></div>
    <button type="button" className="reservation-open" onClick={onOpen}>Ver reserva<Icon name="chevron" /></button>
    <button type="button" className="icon-button reservation-remove" aria-label="Quitar servicio seleccionado" onClick={onRemove}><Icon name="close" /></button>
  </aside>;
}
