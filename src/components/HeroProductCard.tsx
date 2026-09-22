import React from 'react';
import { StoreItem } from '../types/store';
import { STORE_CONFIG } from '../config/store.config';

interface HeroProductCardProps {
  item: StoreItem;
  onAction: (item: StoreItem) => void;
}

export const HeroProductCard: React.FC<HeroProductCardProps> = ({ item, onAction }) => {
  const isService = item.type === 'service';

  return (
    <article className="app-tienda-card">
      <div className="app-tienda-card-media">
        <img
          src={item.image}
          alt={item.name}
          className="app-tienda-card-img"
          loading="lazy"
        />
        <div className="app-tienda-card-tags">
          <span className={`app-tienda-badge ${isService ? 'badge-service' : 'badge-product'}`}>
            {isService ? 'Servicio' : 'Producto'}
          </span>
          {item.popular && (
            <span className="app-tienda-badge badge-popular">Popular</span>
          )}
        </div>
      </div>

      <div className="app-tienda-card-body">
        <div className="app-tienda-card-meta">
          <span className="app-tienda-card-cat">{item.category}</span>
          {item.rating && (
            <span className="app-tienda-card-rating">
              ★ {item.rating.toFixed(1)}
            </span>
          )}
        </div>

        <h3 className="app-tienda-card-title">{item.name}</h3>
        <p className="app-tienda-card-desc">{item.description}</p>

        {isService && item.durationMinutes && (
          <div className="app-tienda-card-duration">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>{item.durationMinutes} min de sesión</span>
          </div>
        )}

        <div className="app-tienda-card-footer">
          <div className="app-tienda-card-price">
            <span className="app-tienda-currency">{STORE_CONFIG.currencySymbol}</span>
            <span className="app-tienda-amount">{item.price.toLocaleString('es-MX')}</span>
            <span className="app-tienda-code">{STORE_CONFIG.currencyCode}</span>
          </div>

          <button
            type="button"
            className={`app-tienda-action-btn ${isService ? 'btn-agenda' : 'btn-cart'}`}
            onClick={() => onAction(item)}
          >
            {isService ? 'Agendar Cita' : 'Agregar al carrito'}
          </button>
        </div>
      </div>
    </article>
  );
};
