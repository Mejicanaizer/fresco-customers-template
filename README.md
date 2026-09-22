# ✂️ Fashion Style & Salon Store Template

> **Plantilla Web Jamstack de Alta Conversión para Salones, Barberías y Tiendas de Cuidado Personal.**
> Desarrollada con React 19, TypeScript, Vite y arquitectura de Diseño Suizo Minimalista.

---

## ✨ Características Principales

- ⚡ **Rendimiento Ultrarrápido:** Compilado a activos estáticos puros, optimizado para carga instantánea vía CDN global (Cloudflare Pages, Vercel, Netlify o Hostinger).
- 📅 **Motor de Agendamiento Interactivo:** Selector dinámico de fechas hábiles, cálculo de franjas horarias y asignación de especialistas en tiempo real.
- 🛍️ **Catálogo Híbrido (Servicios + Productos):** Filtros instantáneos por tipo de ítem y categorías temáticas.
- 📱 **Checkout Directo a WhatsApp:** Generación automática de resumen detallado y pedido formateado listo para confirmación vía WhatsApp Concierge.
- 🎨 **Diseño Suizo & Tokens Semánticos:** Interfaz limpia, tipografía editorial y botones táctiles contrastados (`#18181b`).
- 🛠️ **Configuración Centralizada:** Personaliza todo el negocio (nombre, logo, moneda, catálogo de servicios, horarios, staff y enlaces) modificando un solo archivo: `src/config/store.config.ts`.

---

## 🚀 Inicio Rápido (Local)

### 1. Clonar el repositorio
```bash
git clone https://github.com/Mejicanaizer/fashion-style-template.git
cd fashion-style-template
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Iniciar servidor de desarrollo
```bash
npm run dev
```

### 4. Compilar para producción
```bash
npm run build
```

---

## ⚙️ Personalización del Negocio (`src/config/store.config.ts`)

Para adaptar esta plantilla a cualquier otro negocio, simplemente edite el archivo `src/config/store.config.ts`:

```typescript
export const STORE_CONFIG = {
  storeName: 'Nombre de tu Salón',
  storeTagline: 'Tu propuesta de valor o eslogan',
  logoText: 'NOMBRE SALÓN',
  currencySymbol: '$',
  currencyCode: 'MXN',
  contact: {
    whatsapp: '521234567890', // Número para recibir reservas
    phone: '+52 55 1234 5678',
    email: 'contacto@tudominio.com',
    address: 'Dirección física de la sucursal',
    instagram: '@tu_usuario',
  },
  schedule: {
    slotIntervalMinutes: 30,
    startHour: 9,
    endHour: 20,
    daysAheadAvailable: 14,
    workingDays: [1, 2, 3, 4, 5, 6],
  },
  employees: [ ... ],
  categories: [ ... ],
  items: [ ... ],
};
```

---

## 🌐 Despliegue en 1 Clic

### Cloudflare Pages / Vercel / Netlify
1. Conecta tu repositorio de GitHub.
2. Build command: `npm run build`
3. Output directory: `dist`

---

## 📄 Licencia

MIT © 2026 Fresco Ecosystem
