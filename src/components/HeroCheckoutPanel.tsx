import React, { useState } from 'react';
import { CartItem } from '../types/store';
import { STORE_CONFIG } from '../config/store.config';

interface HeroCheckoutPanelProps {
  isOpen: boolean;
  cartItems: CartItem[];
  onClose: () => void;
  onRemoveItem: (index: number) => void;
  onClearCart: () => void;
}

export const HeroCheckoutPanel: React.FC<HeroCheckoutPanelProps> = ({
  isOpen,
  cartItems,
  onClose,
  onRemoveItem,
  onClearCart,
}) => {
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  const totalAmount = cartItems.reduce(
    (acc, curr) => acc + curr.item.price * curr.quantity,
    0
  );

  const handleWhatsAppCheckout = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim() || !clientPhone.trim()) return;

    let message = `*NUEVO PEDIDO / CITA - ${STORE_CONFIG.storeName}*\n\n`;
    message += `👤 *Cliente:* ${clientName}\n`;
    message += `📱 *Teléfono:* ${clientPhone}\n`;
    if (notes.trim()) message += `📝 *Notas:* ${notes}\n`;
    message += `\n*DETALLE DE LA ORDEN:*\n`;

    cartItems.forEach((ci, idx) => {
      message += `\n${idx + 1}. *${ci.item.name}* (x${ci.quantity}) - ${STORE_CONFIG.currencySymbol}${ci.item.price * ci.quantity}\n`;
      if (ci.item.type === 'service') {
        message += `   📅 Fecha: ${ci.selectedDate || 'Por coordinar'}\n`;
        message += `   ⏰ Hora: ${ci.selectedTime || 'Por coordinar'}\n`;
        message += `   ✂️ Profesional: ${ci.employeeName || 'Cualquiera disponible'}\n`;
      }
    });

    message += `\n*TOTAL: ${STORE_CONFIG.currencySymbol}${totalAmount.toLocaleString('es-MX')} ${STORE_CONFIG.currencyCode}*`;

    const encoded = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${STORE_CONFIG.contact.whatsapp}?text=${encoded}`;

    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    onClearCart();
    onClose();
  };

  return (
    <div className="app-tienda-modal-backdrop" onClick={onClose}>
      <div
        className="app-tienda-drawer-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="app-tienda-drawer-header">
          <h2 className="app-tienda-drawer-title">Resumen de tu Pedido</h2>
          <button
            type="button"
            className="app-tienda-modal-close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="app-tienda-drawer-content">
          {cartItems.length === 0 ? (
            <p className="app-tienda-empty">Tu carrito está vacío.</p>
          ) : (
            <div className="app-tienda-cart-list">
              {cartItems.map((ci, index) => (
                <div key={`${ci.item.id}-${index}`} className="app-tienda-cart-row">
                  <div className="app-tienda-cart-row-details">
                    <h4 className="app-tienda-cart-row-title">{ci.item.name}</h4>
                    {ci.item.type === 'service' ? (
                      <p className="app-tienda-cart-row-meta">
                        {ci.selectedDate} a las {ci.selectedTime} • {ci.employeeName}
                      </p>
                    ) : (
                      <p className="app-tienda-cart-row-meta">Cantidad: {ci.quantity}</p>
                    )}
                    <span className="app-tienda-cart-row-price">
                      {STORE_CONFIG.currencySymbol}{(ci.item.price * ci.quantity).toLocaleString('es-MX')}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="app-tienda-cart-remove"
                    onClick={() => onRemoveItem(index)}
                    aria-label="Eliminar"
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          )}

          {cartItems.length > 0 && (
            <form onSubmit={handleWhatsAppCheckout} className="app-tienda-checkout-form">
              <h3 className="app-tienda-form-title">Tus Datos de Contacto</h3>

              <div className="app-tienda-field-group">
                <label className="app-tienda-field-label">Nombre Completo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Juan Pérez"
                  className="app-tienda-input"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                />
              </div>

              <div className="app-tienda-field-group">
                <label className="app-tienda-field-label">Teléfono / WhatsApp *</label>
                <input
                  type="tel"
                  required
                  placeholder="Ej. 55 1234 5678"
                  className="app-tienda-input"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                />
              </div>

              <div className="app-tienda-field-group">
                <label className="app-tienda-field-label">Instrucciones o Notas Especiales</label>
                <textarea
                  placeholder="Ej. Prefiero corte en tijera / solicitud específica..."
                  className="app-tienda-textarea"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <div className="app-tienda-drawer-footer">
                <div className="app-tienda-drawer-total">
                  <span>Total estimado:</span>
                  <strong>{STORE_CONFIG.currencySymbol}{totalAmount.toLocaleString('es-MX')} {STORE_CONFIG.currencyCode}</strong>
                </div>

                <button type="submit" className="app-tienda-btn-whatsapp">
                  <span>Confirmar y Enviar por WhatsApp</span>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766 0-3.18-2.587-5.771-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.299.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.353.101.173.449.741.964 1.2.662.591 1.221.774 1.394.86.173.086.274.072.376-.043s.433-.505.549-.679c.116-.173.231-.144.39-.086s1.011.477 1.184.564.289.13.332.202c.044.073.044.419-.1.824z" />
                  </svg>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
