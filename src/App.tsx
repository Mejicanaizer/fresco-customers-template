import { useEffect, useRef, useState } from 'react';
import { createStorefrontApi } from './lib/api';
import type { GuestLink, StorefrontApi } from './lib/api';
import type { BookingResult, PublicService, Slot, Storefront } from './lib/contracts';
import { StorefrontLayout, ServiceCard, ReservationSummary, readinessMessages } from './components/StorefrontLayout';
import { BookingDialog } from './components/BookingDialog';
import { BookingReceipt } from './components/BookingReceipt';
import { GuestManagement } from './components/GuestManagement';
import { applyPreviewMedia } from './lib/preview-media';
import { Icon } from './components/StorefrontIcons';
import './styles/store.css';
import './styles/receipt.css';

const defaultApi = createStorefrontApi();
export function App({ api = defaultApi, guestLink = null, linkError = '', paymentReturn = false }: { api?: StorefrontApi; guestLink?: GuestLink | null; linkError?: string; paymentReturn?: boolean }) {
  const [site, setSite] = useState<Storefront | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [category, setCategory] = useState<string | null>(null), [service, setService] = useState<PublicService | null>(null), [result, setResult] = useState<BookingResult | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false), [search, setSearch] = useState('');
  const [illustrativeMedia, setIllustrativeMedia] = useState(false);
  const receiptContainer = useRef<HTMLDivElement>(null);
  const [catalogVisible, setCatalogVisible] = useState(false);
  const [bookedSlot, setBookedSlot] = useState<Slot | null>(null);
  const focused = !catalogVisible && !!(result || guestLink || linkError || paymentReturn);
  const browse = () => { setCatalogVisible(true); window.scrollTo(0, 0); };
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    api.bootstrap(controller.signal).then(applyPreviewMedia).then(({ site: value, illustrativeMedia }) => { if (!controller.signal.aborted) { setIllustrativeMedia(illustrativeMedia); setSite(value); setCategory(null); setSearch(''); } }).catch((e: Error) => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, retry]);
  useEffect(() => { if (site) { document.title = `${site.name} | Reserva de servicios`; document.documentElement.lang = site.locale; } }, [site]);
  useEffect(() => { if (result) receiptContainer.current?.focus(); }, [result]);
  if (loading || error || !site) return <main className="connection-state" id="contenido"><h1>Reserva de servicios</h1>{loading ? <p role="status">Conectando con el negocio…</p> : <><p role="alert">{error || 'La información del negocio no está disponible.'}</p><button type="button" className="app-tienda-btn-confirm" onClick={() => setRetry(x => x + 1)}>Reintentar conexión</button></>}</main>;
  const query = search.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase(site.locale);
  const services = site.services.filter(item => (category === null || item.category === category) && `${item.name} ${item.description} ${item.category}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase(site.locale).includes(query));
  const categories = [...new Set(site.services.map(s => s.category))];
  return <StorefrontLayout site={site} illustrativeMedia={illustrativeMedia} receiptView={focused}>
    <main className="app-tienda-main storefront-container" id="contenido">
      {focused && <div ref={receiptContainer} tabIndex={-1} className="receipt-column">
        {result ? <BookingReceipt key={result.receipt.reference} site={site} api={api} initial={result.receipt} token={result.receiptToken} managementToken={result.managementToken} provider={bookedSlot} onBrowse={browse} /> : linkError ? <><p role="alert" className="notice">{linkError}</p><button type="button" className="text-button" onClick={browse}>Ver otros servicios</button></> : guestLink?.type === 'manage' ? <GuestManagement api={api} site={site} token={guestLink.token} onBrowse={browse} /> : guestLink?.type === 'receipt' ? <><BookingReceipt api={api} site={site} token={guestLink.token} /><button type="button" className="text-button" onClick={browse}>Ver otros servicios</button></> : <div className="notice"><h2>Consulta el estado de tu reserva</h2><p>Esta página no verifica un pago. Abre tu enlace privado o contacta al negocio con tu referencia.</p><button type="button" className="text-button" onClick={browse}>Ver otros servicios</button></div>}
      </div>}
      {!focused && <>
      {!site.booking.ready && <div className="notice" role="status"><h2>Reservas en línea no disponibles</h2>{site.booking.unavailableReasons.map(reason => <p key={reason}>{readinessMessages[reason]}</p>)}<button type="button" className="secondary-button" onClick={() => setRetry(x => x + 1)}>Actualizar disponibilidad del sitio</button></div>}
      <div className="catalog-toolbar">
        <div className="app-tienda-categories-bar" role="group" aria-label="Filtrar servicios por categoría">
          <button className={`app-tienda-cat-chip ${category === null ? 'active' : ''}`} aria-pressed={category === null} type="button" onClick={() => setCategory(null)}>Todos</button>
          {categories.map(cat => <button key={cat} type="button" className={`app-tienda-cat-chip ${category === cat ? 'active' : ''}`} aria-pressed={category === cat} onClick={() => setCategory(cat)}>{cat}</button>)}
        </div>
        <label className="catalog-search"><Icon name="search" /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar servicio" aria-label="Buscar servicio" /></label>
      </div>
      <div className="catalog-heading"><h2>{query ? 'Resultados de búsqueda' : category ?? 'Todos los servicios'}</h2><span aria-live="polite">{services.length} {services.length === 1 ? 'resultado' : 'resultados'}</span></div>
      {services.length ? <div className="app-tienda-grid">{services.map(item => <ServiceCard key={item.id} site={site} service={item} selected={service?.id === item.id} onBook={() => { setService(item); setDrawerOpen(true); }} />)}</div> : <div className="catalog-empty"><Icon name="search" /><p>{query ? 'No encontramos servicios con esa búsqueda.' : 'No hay servicios publicados en esta categoría.'}</p>{query && <button type="button" className="secondary-button" onClick={() => setSearch('')}>Limpiar búsqueda</button>}</div>}
      {site.booking.payment === 'none' && <p className="catalog-payment-note">Sin pago en línea</p>}
      </>}
    </main>
    {service && <>
      <ReservationSummary hidden={drawerOpen} site={site} service={service} onOpen={() => setDrawerOpen(true)} onRemove={() => setService(null)} />
      <BookingDialog key={service.id} open={drawerOpen} site={site} service={service} api={api} onClose={() => setDrawerOpen(false)} onReload={() => { setService(null); setDrawerOpen(false); setRetry(x => x + 1); }} onBooked={(value, chosen) => { setBookedSlot(chosen); setCatalogVisible(false); setResult(value); setService(null); setDrawerOpen(false); }} />
    </>}
  </StorefrontLayout>;
}
export default App;
