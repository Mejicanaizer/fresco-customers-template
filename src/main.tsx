import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { consumeGuestLink } from './lib/api';
import type { GuestLink } from './lib/api';

let guestLink: GuestLink | null = null;
let linkError = '';
try { guestLink = consumeGuestLink(window.location, window.history); }
catch (error) { linkError = error instanceof Error ? error.message : 'El enlace no es válido.'; }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App guestLink={guestLink} linkError={linkError} paymentReturn={window.location.pathname === '/reserva/pago'} />
  </React.StrictMode>,
);
