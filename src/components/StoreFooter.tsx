import React from 'react';
import { STORE_CONFIG } from '../config/store.config';

export const StoreFooter: React.FC = () => {
  return (
    <footer className="app-tienda-footer">
      <div className="app-tienda-footer-container">
        <div className="app-tienda-footer-brand">
          <h3 className="app-tienda-footer-title">{STORE_CONFIG.storeName}</h3>
          <p className="app-tienda-footer-tagline">{STORE_CONFIG.storeTagline}</p>
          <p className="app-tienda-footer-address">📍 {STORE_CONFIG.contact.address}</p>
        </div>

        <div className="app-tienda-footer-links">
          <div className="app-tienda-footer-col">
            <span className="app-tienda-col-title">Contacto Directo</span>
            <a href={`tel:${STORE_CONFIG.contact.phone}`}>{STORE_CONFIG.contact.phone}</a>
            <a href={`mailto:${STORE_CONFIG.contact.email}`}>{STORE_CONFIG.contact.email}</a>
            <a href={`https://wa.me/${STORE_CONFIG.contact.whatsapp}`} target="_blank" rel="noreferrer">
              WhatsApp Concierge
            </a>
          </div>

          <div className="app-tienda-footer-col">
            <span className="app-tienda-col-title">Redes & Comunidad</span>
            <a href={`https://instagram.com/${STORE_CONFIG.contact.instagram.replace('@', '')}`} target="_blank" rel="noreferrer">
              Instagram ({STORE_CONFIG.contact.instagram})
            </a>
          </div>
        </div>
      </div>

      <div className="app-tienda-footer-bottom">
        <p>© {new Date().getFullYear()} {STORE_CONFIG.storeName}. Todos los derechos reservados.</p>
        <p className="app-tienda-powered">Template impulsado por Fresco Ecosystem</p>
      </div>
    </footer>
  );
};
