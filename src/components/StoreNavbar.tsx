import React from 'react';
import { STORE_CONFIG } from '../config/store.config';

interface StoreNavbarProps {
  cartCount: number;
  onOpenCart: () => void;
}

export const StoreNavbar: React.FC<StoreNavbarProps> = ({ cartCount, onOpenCart }) => {
  return (
    <header className="app-tienda-navbar">
      <div className="app-tienda-nav-container">
        <div className="app-tienda-brand">
          <span className="app-tienda-brand-badge">EST. 2026</span>
          <span className="app-tienda-brand-name">{STORE_CONFIG.logoText}</span>
        </div>

        <div className="app-tienda-nav-actions">
          <a
            href={`https://wa.me/${STORE_CONFIG.contact.whatsapp}`}
            target="_blank"
            rel="noopener noreferrer"
            className="app-tienda-nav-contact"
          >
            <span>WhatsApp Directo</span>
          </a>

          <button
            type="button"
            className="app-tienda-nav-cart-btn"
            onClick={onOpenCart}
            aria-label="Abrir carrito"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
            {cartCount > 0 && <span className="app-tienda-nav-cart-badge">{cartCount}</span>}
          </button>
        </div>
      </div>
    </header>
  );
};
