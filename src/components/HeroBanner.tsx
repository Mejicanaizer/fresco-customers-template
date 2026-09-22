import React from 'react';
import { STORE_CONFIG } from '../config/store.config';

export const HeroBanner: React.FC = () => {
  return (
    <section className="app-tienda-hero">
      <div className="app-tienda-hero-content">
        <span className="app-tienda-hero-pill">Catálogo Exclusivo & Agendamiento</span>
        <h1 className="app-tienda-hero-title">
          Eleva tu estilo con <span className="app-tienda-hero-accent">{STORE_CONFIG.storeName}</span>
        </h1>
        <p className="app-tienda-hero-subtitle">
          {STORE_CONFIG.storeTagline}. Selecciona tu servicio, elige tu especialista y horario ideal, o adquiere nuestros productos profesionales para el cuidado diario.
        </p>
      </div>
    </section>
  );
};
