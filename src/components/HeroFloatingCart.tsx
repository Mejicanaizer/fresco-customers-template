import React from 'react';
import { CartItem } from '../types/store';
import { STORE_CONFIG } from '../config/store.config';

interface HeroFloatingCartProps {
  cartItems: CartItem[];
  onOpenCheckout: () => void;
}

export const HeroFloatingCart: React.FC<HeroFloatingCartProps> = ({
  cartItems,
  onOpenCheckout,
}) => {
  const totalCount = cartItems.reduce((acc, curr) => acc + curr.quantity, 0);
  const totalAmount = cartItems.reduce(
    (acc, curr) => acc + curr.item.price * curr.quantity,
    0
  );

  if (totalCount === 0) return null;

  return (
    <aside className="app-tienda-floating-bar" aria-label="Carrito de compras">
      <div className="app-tienda-floating-info">
        <span className="app-tienda-floating-count">
          {totalCount} {totalCount === 1 ? 'ítem' : 'ítems'}
        </span>
        <span className="app-tienda-floating-divider">•</span>
        <span className="app-tienda-floating-total">
          {STORE_CONFIG.currencySymbol}{totalAmount.toLocaleString('es-MX')} {STORE_CONFIG.currencyCode}
        </span>
      </div>

      <button
        type="button"
        className="app-tienda-floating-btn"
        onClick={onOpenCheckout}
      >
        <span>Ver Carrito / Checkout</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </button>
    </aside>
  );
};
