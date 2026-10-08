# CHANGELOG — insight-b2b

Historial de cambios, decisiones arquitectónicas y plan de desarrollo.

---

## Fase 0: Estado Inicial (Proyecto abandonado → Retomado)

### Stack original
- React 19 + TypeScript 6 + Vite 8
- WooCommerce vía REST API (proxy custom en Vite)
- Mercado Público API (proxy Vite con ticket injection)
- SPA sin router, sin testing, CSS vanilla

### Funcionalidades existentes
- Selección de tipo usuario: ChileCompra | Convenio Marco
- Catálogo de productos (desde WooCommerce, max 50, sin búsqueda ni paginación)
- Agregar/quitar productos a cotización
- Precios por ambiente via `meta_data` de WooCommerce (`precio_chilecompra`, `precio_convenio_marco`)
- Convenio Marco: ingreso de código de licitación + consulta a Mercado Público
- Descarga de cotización como `.txt`
- Header con navegación y badge de cantidad

### Decisiones tomadas
- **Eliminar WooCommerce/WordPress**: Demasiada complejidad para lo que se necesita (solo sirve como base de datos de productos). Mantener WP solo para exponer una API REST de productos no justifica el costo de infraestructura, mantención y acoplamiento.
- **Gestión propia de productos**: Esquema de base de datos propio con campos nativos para precios B2B.

---

## Fase 1: Arquitectura Nueva — Backend Propio

### Stack elegido

| Capa | Tecnología | Razón |
|---|---|---|
| **Frontend** | React 19 + Vite 8 (existente) | Ya funciona, desplegado en Vercel |
| **Backend** | Express + TypeScript | Simplicity, amplio ecosistema, funciona en Railway |
| **ORM** | Drizzle ORM | Ligero, type-safe, sin codegen pesado como Prisma |
| **Database** | PostgreSQL (Railway) | Incluido en plan Railway, no costo extra |
| **Parsing Excel** | xlsx (SheetJS) | Estándar para leer/escribir .xlsx en Node |
| **Hosting Backend** | Railway ($5/mo hobby plan) | Ya lo usa el usuario, soporta Node + PostgreSQL nativo |

### Por qué NO otras opciones

| Opción | Por qué no |
|---|---|
| **Supabase** | Servicio externo adicional, free tier limitado (500MB), innecesario para un CRUD de productos |
| **SQLite** | No funciona bien en despliegues serverless/contenedorizados, sin concurrent writes eficientes |
| **MongoDB** | Overkill para datos estructurados de productos, sin ventaja real sobre PostgreSQL |
| **Prisma** | ORM pesado, genera código, más complejo de configurar que Drizzle |
| **Next.js API routes** | El frontend ya está en Vite, no tiene sentido migrar a Next.js solo por las API routes |

---

### Esquema de Base de Datos

```sql
-- Productos principales
CREATE TABLE products (
  id            SERIAL PRIMARY KEY,
  sku           VARCHAR(100) UNIQUE NOT NULL,
  name          VARCHAR(500) NOT NULL,
  description   TEXT,
  short_desc    VARCHAR(1000),
  regular_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  stock         INTEGER NOT NULL DEFAULT 0,
  status        VARCHAR(20) NOT NULL DEFAULT 'active',  -- active | inactive
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

-- Precios por ambiente B2B (columnas nativas, no metadata)
ALTER TABLE products ADD COLUMN price_chilecompra   DECIMAL(12,2);
ALTER TABLE products ADD COLUMN price_convenio_marco DECIMAL(12,2);

-- Categorías
CREATE TABLE categories (
  id        SERIAL PRIMARY KEY,
  name      VARCHAR(255) NOT NULL,
  slug      VARCHAR(255) UNIQUE NOT NULL,
  parent_id INTEGER REFERENCES categories(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Relación producto-categoría (muchos a muchos)
CREATE TABLE product_categories (
  product_id  INTEGER REFERENCES products(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_id)
);

-- Imágenes de producto
CREATE TABLE product_images (
  id         SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  alt        VARCHAR(500),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

### API Endpoints

#### Productos
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/products` | Listar productos (con search, filter, pagination) |
| GET | `/api/products/:id` | Obtener un producto |
| POST | `/api/products` | Crear producto unitario |
| PUT | `/api/products/:id` | Actualizar producto |
| DELETE | `/api/products/:id` | Eliminar producto |

#### Carga masiva
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/products/import` | Subir Excel y crear/actualizar productos |
| GET | `/api/products/template` | Descargar plantilla Excel vacía |

#### Categorías
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/categories` | Listar categorías |
| POST | `/api/categories` | Crear categoría |

#### Mercado Público (proxy)
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/mp/licitaciones.json` | Proxy a Mercado Público (existente, se mantiene) |

---

### Formato de Excel para Importación

| Columna | Requerido | Descripción |
|---|---|---|
| SKU | Sí | Identificador único del producto |
| Nombre | Sí | Nombre del producto |
| Descripción | No | Descripción larga |
| Descripción Corta | No | Descripción breve |
| Precio Regular | Sí | Precio base |
| Precio ChileCompra | No | Precio para ambiente ChileCompra |
| Precio Convenio Marco | No | Precio para ambiente Convenio Marco |
| Stock | No | Cantidad disponible (default: 0) |
| Estado | No | active/inactive (default: active) |
| Categorías | No | Separadas por coma |

---

### Cambios en Frontend

#### Nuevos componentes/views
- `AdminView.tsx` — Panel de administración de productos
- `ProductForm.tsx` — Formulario creación/edición de producto
- `ProductTable.tsx` — Tabla de listado con búsqueda, paginación, acciones
- `ExcelUploader.tsx` — Drag & drop para carga masiva + preview antes de importar
- `TemplateDownloader.tsx` — Botón para descargar plantilla Excel

#### Componentes existentes a modificar
- `CatalogView.tsx` — Conectar al nuevo backend, agregar búsqueda y paginación
- `ProductCard.tsx` — Adaptar a nuevo esquema de producto (sin meta_data)
- `Header.tsx` — Agregar link a panel admin
- `QuoteView.tsx` — Adaptar tipos, mejorar descarga (futuro: PDF)

#### Archivos a eliminar
- `src/services/woocommerce.ts` — Servicio WooCommerce completo
- `vite.config.ts` — Eliminar proxy `wcPlugin` (mantener solo proxy MP)
- `.env` — Eliminar variables `WOOCOMMERCE_*`

#### Tipos a modificar
- `src/types/product.ts` — Reescribir para nuevo esquema (sin `meta_data`, con `price_chilecompra`/`price_convenio_marco` como campos nativos)
- `src/types/quote.ts` — Actualizar `getItemPrice()` para usar campos nativos

---

### Cambios en Infraestructura

| Archivo | Acción |
|---|---|
| `vite.config.ts` | Eliminar `wcPlugin`, agregar proxy `/api` → Railway backend |
| `package.json` | Agregar scripts para backend |
| `.env` | Eliminar WC vars, agregar `API_BASE_URL` |
| `.env.example` | Crear con todas las variables requeridas |
| `railway.json` | Crear para deploy automático del backend |
| `AGENTS.md` | Actualizar documentación |

---

### Estructura Final del Proyecto

```
insight-b2b/
├── backend/                    # Express + Drizzle + PostgreSQL
│   ├── src/
│   │   ├── index.ts           # Entry point Express
│   │   ├── db/
│   │   │   ├── index.ts       # Drizzle client
│   │   │   ├── schema.ts      # Tablas definidas
│   │   │   └── migrate.ts     # Migraciones
│   │   ├── routes/
│   │   │   ├── products.ts    # CRUD productos
│   │   │   ├── categories.ts  # CRUD categorías
│   │   │   └── import.ts      # Importación Excel
│   │   └── services/
│   │       └── excel.ts       # Parser Excel con xlsx
│   ├── package.json
│   ├── tsconfig.json
│   └── drizzle.config.ts
├── src/                        # Frontend React (existente, modificado)
│   ├── types/
│   ├── services/
│   │   ├── api.ts             # Nuevo cliente API genérico
│   │   └── mercadopublico.ts  # Se mantiene
│   ├── context/
│   ├── components/
│   └── views/
├── vite.config.ts             # Proxy simplificado (solo MP + backend)
├── package.json
└── CHANGELOG.md               # Este archivo
```

---

### Orden de Implementación

1. **Crear backend**: Express + Drizzle + schema + migraciones
2. **API de productos**: CRUD completo con search/pagination
3. **Carga masiva**: Endpoint de importación Excel + parser
4. **Frontend: Servicio API**: Reemplazar WooCommerce service con nuevo cliente
5. **Frontend: Tipos**: Reescribir `product.ts` para nuevo esquema
6. **Frontend: Admin panel**: ProductForm, ProductTable, ExcelUploader
7. **Frontend: Catálogo**: Actualizar CatalogView con búsqueda y paginación
8. **Frontend: Cotización**: Adaptar QuoteView a nuevos tipos
9. **Cleanup**: Eliminar WooCommerce code, actualizar proxy, limpiar .env
10. **Deploy config**: railway.json, .env.example, AGENTS.md actualizado

### Progreso

| Paso | Estado |
|---|---|
| 1. Backend base | ✅ Completado |
| 2. API CRUD productos | ✅ Completado |
| 3. Carga masiva Excel | ✅ Completado |
| 4. Frontend servicio API + tipos | ✅ Completado |
| 5. Frontend admin panel | ✅ Completado |
| 6. Frontend cotización mejorada | ✅ Completado |
| 7. Cleanup + Deploy config | ✅ Completado |

---

### Presupuesto Estimado

| Servicio | Costo |
|---|---|
| Vercel (frontend) | Gratis (hobby) |
| Railway (backend + PostgreSQL) | ~$5/mo (hobby plan) |
| Dominio | El que ya tenga |
| **Total** | **~$5/mo** |

---

## Registro de Cambios

### [Unreleased]

#### Added
- CHANGELOG.md — Historial de cambios y plan de desarrollo
- Backend Express con TypeScript (`backend/`)
- Drizzle ORM con esquema PostgreSQL (`backend/src/db/schema.ts`)
- Tablas: `products`, `categories`, `product_categories`, `product_images`
- Cliente Drizzle (`backend/src/db/index.ts`)
- Script de migraciones (`backend/src/db/migrate.ts`)
- API CRUD de productos: GET (list + search + pagination), GET by id, POST, PUT, DELETE (`backend/src/routes/products.ts`)
- API de categorías: GET, POST (`backend/src/routes/categories.ts`)
- Importación masiva vía Excel: upload, parsing, validación, preview, confirm (`backend/src/routes/import.ts`)
- Descarga de plantilla Excel (`GET /api/products/template`)
- Endpoint de salud (`GET /api/health`)
- Configuración Drizzle Kit (`backend/drizzle.config.ts`)
- Variables de entorno: DATABASE_URL, PORT, CORS_ORIGIN
- Frontend: servicio API genérico (`src/services/api.ts`) — CRUD productos, importación, template
- Frontend: tipos de producto reescritos (`src/types/product.ts`) — campos nativos sin meta_data
- Frontend: `getItemPrice()` actualizado para usar `priceChilecompra`/`priceConvenioMarco` directos
- Frontend: `View` type ampliado con `'admin'`
- Frontend: `CatalogView` con búsqueda y paginación
- Frontend: `ProductCard` adaptado a nuevo esquema (sin images HTML, sin stock_status)
- Frontend: proxy Vite simplificado (eliminado wcPlugin, proxy a backend Express)
- Frontend: `.env.example` con variables requeridas
- Frontend: `AdminView` — panel de administración con tabs (Listado, Nuevo, Carga Masiva)
- Frontend: `ProductTable` — tabla de productos con búsqueda, paginación, editar/eliminar
- Frontend: `ProductForm` — formulario de creación/edición de producto con validación
- Frontend: `ExcelUploader` — drag & drop, preview antes de importar, descarga de plantilla
- Frontend: Header con link a Admin
- Frontend: estilos CSS para admin (tabs, tabla, formulario, uploader, drop-zone, paginación)
- Backend: `railway.json` para deploy automático en Railway
- `.gitignore` actualizado para cubrir `backend/dist`, `backend/drizzle`, `backend/.env`

#### Changed
- `src/types/product.ts` — Reescrito: campos nativos `priceChilecompra`, `priceConvenioMarco`, sin `meta_data`
- `src/types/quote.ts` — `getItemPrice()` usa campos nativos, `View` type incluye `'admin'`
- `src/views/CatalogView.tsx` — Conectado a nuevo backend, búsqueda y paginación
- `src/views/AdminView.tsx` — Vista admin con tabs (Listado, Nuevo, Carga Masiva)
- `src/views/QuoteView.tsx` — Descarga mejorada con formato tabular, SKU, precio aplicado, nombre de archivo descriptivo
- `src/components/Header.tsx` — Agregado link a Admin
- `src/App.tsx` — Agregado `AdminView` al routing de vistas
- `src/components/ProductCard.tsx` — Adaptado a nuevo esquema (sin `images[]` HTML, sin `stock_status`)
- `vite.config.ts` — Eliminado `wcPlugin`, proxy a backend Express para `/api/products`, `/api/categories`, `/api/health`
- `.env` — Eliminadas variables `WOOCOMMERCE_*`, agregado `API_BASE_URL`

#### Removed
- `src/services/woocommerce.ts` — Servicio WooCommerce completo
- Proxy `wcPlugin` de Vite
- Variables de entorno `WOOCOMMERCE_URL`, `WOOCOMMERCE_KEY`, `WOOCOMMERCE_SECRET`
- Dependencia de WordPress/WooCommerce
- `src/assets/` — hero.png, react.svg, vite.svg (assets sin usar)
- `public/icons.svg` — SVG sprite sin usar
- `dist/` — Build viejo eliminado
- `AGENTS.md` — Reescrito completamente con nueva arquitectura

---

## Fase 2: Enfoque E-commerce con Clientes Diferenciados

Cambio de enfoque: de "herramienta de cotización" a e-commerce B2B tipo prisa.cl, donde el
canal de compra y el precio dependen del **tipo de cliente registrado**:

- **Cliente Normal** → compra con su lista de precios asignada (`companies.priceListId`).
- **Cliente ChileCompra** → compra contra licitación ganada con la **lista única de Mercado Público**
  (`price_lists.is_mp_price_list = true`).
- **Cliente Both** → puede elegir canal en la request (`?channel=retail|chilecompra`).
- Sin sesión → precios ocultos (catálogo público, como prisa.cl).

### Paso 1 (completado) — Modelo y precios server-side

#### Added
- `backend/src/services/pricing.ts` — `resolvePriceContext()` resuelve el contexto de precios según el cliente autenticado (retail → lista asignada; chilecompra → lista MP del proveedor; anonymous → sin precios).
- `backend/src/middleware/auth.ts` — `getAuthFromRequest()` para endpoints públicos que resuelven precios según token opcional.

#### Changed
- `backend/src/db/schema.ts` — `companies.type` (`normal|chilecompra|both`, default `normal`); `orders.channel` (default `retail`); `orders.licitacion_code`.
- `backend/src/routes/products.ts` — `GET /products`, `GET /products/:id`, `GET /products/my-price` resuelven la lista de precio desde el token (`?channel=...` para clientes `both`); se eliminó el parámetro `price_list_id`.
- `backend/src/routes/auth.ts` — Registro acepta `companyType`; `register-cotizador` default `chilecompra`; respuestas de login/register/me incluyen `company.type` y `priceListId`.
- `backend/src/routes/users.ts` — `PUT /users/company` acepta `type`.
- `src/types/auth.ts` — Nuevos tipos `CompanyType`, `BuyChannel`; `AuthCompany.type`.
- `src/services/api.ts` — `getProducts()` usa `channel` en vez de `priceListId`; datos de registro aceptan `companyType`.
- `src/views/CatalogView.tsx` — Envía `channel` derivado de `company.type`.
- `src/views/HomeView.tsx` — El canal se deriva del cliente: `normal`/`chilecompra` van directo al catálogo; solo `both` muestra el selector.
- `src/views/RegisterCotizadorView.tsx` — Selector de tipo de comprador (ChileCompra | Normal).

#### Pendiente
- Admin: asignación de lista de precios y tipo por empresa.

### Paso 2 (completado) — Carrito → checkout → órdenes

#### Added
- `backend/src/routes/orders.ts` — `POST /orders` (crea orden + ítems, valida stock y `minOrderQty`, recalcula precios server-side con IVA inline 19%, genera `orderNumber` `OC-YYYYMMDD-XXXXXX`, descuenta stock en transacción; requiere `licitacionCode` para canal chilecompra), `GET /orders` (paginado por empresa), `GET /orders/:id` (detalle con ítems), `POST /orders/:id/cancel` (devuelve stock, solo `pending|confirmed`, reentrante).
- `src/types/order.ts` — Tipos `Order`, `OrderItem`, `OrderStatus`, `CreateOrderData`, `CreateOrderResponse`, `OrderListResponse` + helpers `getOrderStatusLabel`, `getOrderStatusClass`, `getChannelLabel`.
- `src/views/CartView.tsx` — Checkout: lista de ítems, canal derivado con `resolveChannel(company.type, userType)`, campo licitación para ChileCompra, método de pago, dirección/notas/PO#, desglose subtotal + IVA, confirma el pedido.
- `src/views/OrdersView.tsx` — "Mis Pedidos": lista paginada con N° pedido, canal, licitación, total y estado.
- `src/views/OrderDetailView.tsx` — Detalle con meta del pedido, ítems, totales y botón cancelar (solo `pending|confirmed`).

#### Changed
- `backend/src/index.ts` — Montado `ordersRouter` en `/api/orders`.
- `src/services/api.ts` — `createOrder()`, `getOrders()`, `getOrder()`, `cancelOrder()`.
- `src/types/quote.ts` — `View` ampliada (`'cart' | 'orders' | 'order-detail'`, se eliminó `'quote'`); `resolveChannel(companyType, userType)`; `getItemPrice()` sin parámetro `userType` (precios ya resueltos server-side).
- `src/context/AppContext.tsx` — Estado `selectedOrder` + `viewOrder()` / `backToOrders()`.
- `src/App.tsx` — Registradas `CartView`, `OrdersView`, `OrderDetailView` (removida `QuoteView`).
- `src/components/Header.tsx` — Botones "Carrito" (con badge) y "Pedidos".
- `src/views/ProductDetailView.tsx` — Copy "cotización" → "carrito"; navega a `cart`.
- `src/components/ProductCard.tsx` — Copy "cotización" → "carrito".

#### Removed
- `src/views/QuoteView.tsx` — Reemplazada por `CartView` (flujo cotización → órdenes).
- Flujo `submitQuote` del frontend (la API `/quotes` y el dashboard se mantienen).

#### Pendiente
- Admin: asignación de lista de precios y tipo por empresa.
- Admin: gestión de órdenes (confirmar/enviar/entregar) y estados.
- PDF de orden/boleta.
- Persistencia del carrito (localStorage o backend).

### Paso 3 (completado) — Admin: órdenes y clientes

#### Added
- `backend/src/routes/companies.ts` — `GET /companies` (lista empresas con búsqueda y `userCount`), `PUT /companies/:id` (asigna `type`, `priceListId` — validado que pertenezca al proveedor — y `status`; al pasar a `active` se marca `approvedAt`/`approvedBy`).
- `backend/src/routes/orders.ts` — Rutas admin del proveedor: `GET /orders/admin` (pedidos de clientes, filtrados por productos de la empresa autenticada, paginado y por estado, con nombre del cliente), `GET /orders/admin/:id` (detalle), `PUT /orders/:id/status` (transiciones `pending→confirmed→shipped→delivered`, cancelación desde `pending|confirmed`; valida acceso a la orden).
- `src/components/AdminOrders.tsx` — Tab "Órdenes": lista de pedidos de clientes con filtro por estado, detalle expandible (meta, ítems, totales) y botón de siguiente estado.
- `src/components/CompaniesManager.tsx` — Tab "Clientes": tabla de empresas con búsqueda y edición inline de tipo, lista de precio y estado (con validación server-side).
- `src/services/api.ts` — `getAdminOrders()`, `getAdminOrder()`, `updateOrderStatus()`, `getCompanies()`, `updateCompany()`, `getPriceLists()`.

#### Changed
- `backend/src/index.ts` — Montado `companiesRouter` en `/api/companies`.
- `src/views/AdminView.tsx` — Nuevos tabs "Órdenes" y "Clientes" (gated por `isEmpresa`).
- `src/types/order.ts` — `Order.companyName` opcional para la vista admin.
- `src/App.css` — Estilos para panel de detalle de orden, selects de tabla y celdas de empresa.

#### Pendiente
- PDF de orden/boleta.
- Persistencia del carrito (localStorage o backend).
- Notificaciones al cliente cuando su pedido cambia de estado.
- Bloqueo de compra para empresas suspendidas/no aprobadas.

### Paso 4 (completado) — Carrito persistente, bloqueo de compra, notificaciones y PDF

#### Added
- `src/context/AppContext.tsx` — Persistencia del carrito (`items` + `licitacionCode`) en `localStorage` (clave `insight-b2b.cart.v1`), con hidratación inicial y escritura en cada cambio.
- `backend/src/services/notifications.ts` — `notifyCompanyUsers()` crea una notificación por usuario de la empresa.
- `backend/src/routes/notifications.ts` — `GET /notifications` (lista + `unread`), `PUT /notifications/:id/read`, `PUT /notifications/read-all`.
- `backend/src/routes/orders.ts` — `GET /orders/:id/pdf` (comprador o proveedor con acceso a la orden) genera PDF con pdfkit (header, meta del pedido, tabla de ítems y totales). Notificaciones al cliente en creación, cambio de estado y cancelación.
- `src/types/notification.ts` — Tipo `AppNotification`.
- `src/components/NotificationBell.tsx` — Campana con contador de no leídas y dropdown (marcar leída / marcar todas, navega al pedido desde `referenceType: "order"`).
- `src/services/api.ts` — `getNotifications()`, `markNotificationRead()`, `markAllNotificationsRead()`, `downloadOrderPdf()`, `triggerBlobDownload()`.
- `src/views/OrderDetailView.tsx` — Botón "Descargar PDF".
- `src/components/AdminOrders.tsx` — Botón "Descargar PDF" en el detalle del proveedor.

#### Changed
- `backend/src/services/pricing.ts` — `PriceContext` incluye `status` del comprador.
- `backend/src/routes/orders.ts` — `POST /orders` rechaza empresas con `status !== "active"` (mensaje distinto para `suspended` vs `pending`).
- `backend/src/routes/auth.ts` — Respuestas login/register/me incluyen `company.status`.
- `backend/src/index.ts` — Montado `notificationsRouter` en `/api/notifications`.
- `backend/package.json` — Dependencias `pdfkit` y `@types/pdfkit`.
- `src/types/auth.ts` — `AuthCompany.status` + tipo `CompanyStatus`.
- `src/views/CartView.tsx` — Bloquea el checkout cuando la empresa no está `active` (aviso + sin formulario/botón de confirmar).
- `src/components/Header.tsx` — Campana de notificaciones para usuarios autenticados.
- `src/App.css` — Estilos de la campana/dropdown de notificaciones.

#### Pendiente
- Conectar con ERP Microsoft Dynamics para inserción de datos.
- Notificaciones por email (actualmente solo in-app).
- Verificación visual del PDF generado (columnas/totales) en producción.

### Paso 5 (completado) — Notificaciones por email

#### Added
- `backend/src/services/email.ts` — `sendEmail()` y `sendCompanyEmail()` (a los usuarios activos de la empresa) con Nodemailer. Configuración vía `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. Si no hay `SMTP_HOST`, se loguea y se omite (las notificaciones quedan solo in-app). `sendEmail` nunca lanza (los errores de envío se registran).

#### Changed
- `backend/src/services/notifications.ts` — `notifyCompanyUsers()` además de crear la notificación in-app envía el email correspondiente (mismo título/mensaje). Se usa en creación de pedido, cambio de estado y cancelación (vía `safeNotify`, por lo que un fallo de email no rompe el flujo).
- `backend/src/routes/orders.ts` — Al crear un pedido, además de notificar al cliente, notifica (in-app + email) a cada proveedor que tiene productos en la orden ("Nuevo pedido recibido", con nombre del cliente).
- `src/views/OrderDetailView.tsx` — Soporte para proveedor: carga con `getAdminOrder` cuando el usuario es `empresa` y oculta el botón de cancelar (el proveedor cancela desde el panel admin).
- `backend/package.json` — Dependencias `nodemailer` y `@types/nodemailer`.
- `backend/.env.example` — Variables SMTP documentadas.

#### Pendiente
- Conectar con ERP Microsoft Dynamics para inserción de datos.
- Verificación visual del PDF generado (columnas/totales) en producción.

### Fase 3 (en curso) — Requisitos mínimos de plataforma B2B

#### Added
- `backend/src/routes/products.ts` — `GET /api/products/search` (autocompletado por nombre/SKU), filtros de listado `min_price`/`max_price`, `in_stock`, `min|max_length`/`width`/`height`; validación `validateMeasures()`; detalle incluye `documents`.
- Tabla `product_documents` + `PRODUCT_DOC_TYPES` (`hoja_seguridad`, `manual`, `ficha_tecnica`, `otro`).
- `backend/src/routes/uploads.ts` — `POST/GET /products/:id/documents`, `DELETE /products/:id/documents/:docId` (PDF ≤ 10MB, `uploads/docs`).
- Campos en `products`: `length_cm`, `width_cm`, `height_cm`, `weight_kg`.
- Campos en `customers`: `billing_address`, `billing_commune`, `billing_region`, `payment_terms` (validado contra `PAYMENT_TERMS = ['contado','30','60','90']`).
- `backend/src/routes/quotes.ts` — `quoteScope()`, `POST /quotes` infiere `companyId` desde los productos, `GET /quotes/:id`, `GET /quotes/:id/pdf` (PDFKit, neto/IVA 19%/total), `GET /quotes/stats`, orden de rutas reconstruido.
- Frontend: autocompletado en `Header.tsx` (resultados de `/products/search` con debounce); panel de filtros y "Pedido rápido por código" en `HomeView.tsx`; bloque de cotización (guardar + descargar PDF) en `CartView.tsx`; dimensiones, lista de documentos y neto/IVA en `ProductDetailView.tsx` y `ProductCard.tsx`; gestión de documentos y dimensiónes en `ProductForm.tsx`; condición de pago y dirección facturación en `CustomersManager.tsx`.
- `src/types/product.ts` — `ProductDocument`; `src/types/quote.ts` — `TAX_RATE`, `getPriceWithTax()`.

#### Changed
- Wording unificado a "Orden de Compra" en carrito, listas, detalle, panel admin y notificaciones/emails.
- `uploadImages`/`uploadTechnicalSheet` en `src/services/api.ts` ahora envían `Authorization` (fix de bug: antes 401 al subir como empresa/admin).
- `src/App.css` — Estilos para autocompletado, filtros, pedido rápido, documentos, cotización y precio neto/IVA.

#### Pendiente
- Carga de productos reales de IMEX ESTADO + datos legales (RUT, razón social, giro, contactos, logo).
- Reemplazar teléfono de contacto de IMEX (`+56 9 8765 4321` es placeholder de demo) por el real, para el botón de WhatsApp.
- Cambiar password temporal de `admin@imex.cl` (`imex-admin-temp-2026`).
- Verificación visual del PDF en producción.
- Conectar con ERP Microsoft Dynamics.

### Fase 4 (en curso) — MVP pulido: retención de comprador y venta

#### Added
- `PUT /api/quotes/:id/status` — el vendedor/admin cambia el estado de una cotización (`pending`/`approved`/`rejected`/`converted`); `GET /api/quotes` ahora lo pueden consumir **también los compradores** (se acota por `customer_id` o `user_id`), y las respuestas de `POST`/`GET /quotes` incluyen `sellerName` y `sellerPhone`.
- Nueva vista de comprador **"Mis Cotizaciones"** (`src/views/QuotesView.tsx`): listado propio (fecha, canal, licitación, ítems, total con IVA, estado, vendedor), descarga de PDF, botón WhatsApp y CTA en estado vacío; enlace "Cotizaciones" en el header y acceso "Ver mis cotizaciones" tras guardar en el carrito.
- **Límite de crédito en pedidos**: `POST /api/orders` rechaza si `total > creditLimit - creditUsed` y suma el total a `customers.credit_used`; `POST /api/orders/:id/cancel` descuenta `creditUsed` al cancelar. `orders.credit_used` se registra por pedido.
- **Productos destacados**: columna `products.featured` (bool), filtro `?featured=1` en `GET /products`, soporte en POST/PUT; toggle ★ en `ProductTable.tsx`, checkbox "Mostrar en Destacados" en `ProductForm.tsx` y sección **"Destacados"** en `HomeView.tsx`.
- **Repetir pedido**: botón en `OrderDetailView.tsx` que vuelve a cargar el carrito con los ítems de una OC anterior (`addItem(product, qty)`); `addItem` de `AppContext` ahora acepta cantidad.
- **Cotización por WhatsApp** (`src/utils/whatsapp.ts`): enlace `wa.me` con resumen (ítems, subtotal neto, IVA, total) en la vista de cotizaciones y tras guardar en el carrito; normalización de teléfono chileno.
- **Optimización de imágenes** (`backend/src/services/image.ts` + `sharp`): al subir imágenes de producto se re-dimensionan a máx. 1200px y se re-codifican a WebP (calidad 82, fondo blanco, se borra el original); logos a máx. 512px.
- **Fallback amigable Mercado Público**: mensaje claro cuando el servicio externo no está disponible (401/403/5xx o mensajes de ticket) en `LicitacionInfo.tsx` / `mercadopublico.ts`.
- Franja de confianza en el home (despacho a todo Chile, facturación electrónica, pago 30·60·90, atención B2B) y estados vacío del catálogo con botón "Limpiar búsqueda y filtros".

#### Changed
- `src/types/quote.ts` — nueva vista `'quotes'`; `src/services/api.ts` — `GetProductsParams.featured`, `CreateProductData.featured`, `updateQuoteStatus()`.
- Botón "Repetir pedido" oculto para el rol `empresa` en el detalle de pedido.

#### Despliegue MVP (preparación)
- `vercel.json` — rewrites `/api/*` y `/uploads/*` hacia el backend de Railway (inicialmente con placeholder `REEMPLAZAR-CON-TU-DOMINIO.up.railway.app`; ver "Puesta en producción Railway" abajo para el dominio real).
- `backend/src/routes/mercadopublico.ts` — proxy de Mercado Público en Express: `GET /api/mp/licitaciones.json` consulta la API pública con `MERCADO_PUBLICO_TICKET` server-side (503 con mensaje amigable si no hay ticket o el servicio falla).
- `engines.node: >=22.12.0` en `package.json` (front y backend) para fijar Node 22 en Vercel/Nixpacks.
- Correcciones: `CartView` enviaba `userType` con vocabulario equivocado (`general`/`mercadopublico`) que el backend rechaza al guardar la cotización → ahora mapea a `chilecompra`/`convenio-marco` según el canal; `ProductDetailView` ahora pide el producto completo (`GET /products/:id`) para mostrar todas las imágenes.
- `AGENTS.md` — sección "Despliegue MVP (Vercel + Railway)" con pasos para GitHub, Railway (Postgres, volumen en `backend/uploads`, migración y usuarios) y Vercel (rewrites).
- Repo Git inicializado (rama `main`, primer commit) con `backend/uploads/` versionado para que el demo conserve imágenes; `.env`, `*.pid` y `backend/drizzle` ignorados.

### Puesta en producción Railway (2026-10-07)

#### Done
- Proyecto Railway `happy-endurance` / env `production`: servicio `b2b-insight` (root directory `backend/`, Nixpacks, `npm start`, healthcheck `/api/health`) + Postgres con volume propio.
- Variables del servicio: `DATABASE_URL` (internal), `JWT_SECRET`, `MERCADO_PUBLICO_TICKET`. `db:push` aplicado y usuarios creados contra la BD de producción: admin de plataforma `fdonoso@insightechnology.cl` y vendedor **IMEX ESTADO** (RUT real `84888400-6`, slug `imex-estado`, admin `admin@imex.cl`).
- Fix `backend/src/scripts/create-company.ts`: el INSERT listaba 18 columnas pero el `VALUES` terminaba en `$16` → "INSERT has more target columns than expressions"; se agregó `$17` (status). El RUT documentado antes (`96.185.309-7`) tiene DV inválido; se corrigió a `84888400-6`.
- Dominio público: `https://b2b-insight-production.up.railway.app` (verificado: `/api/health` ok, proxy Mercado Público responde, login admin y empresa ok).
- `vercel.json` apunta al dominio real de Railway (listo para importar en Vercel).

#### Volume (lección aprendida)
- Con root `backend/`, Railway monta el código en `/app` (cwd `/app`, build `/app/dist`, uploads en `/app/uploads`), NO en `/app/backend`.
- El volume debe montarse en **`/app/uploads`** (coincide con `RAILWAY_VOLUME_MOUNT_PATH`). Un primer intento en `/app/backend/uploads` hizo que la app siguiera escribiendo en el filesystem efímero y los archivos se perdieran en cada redeploy; se diagnosticó con logs de arranque (`process.cwd()`, `__dirname`, `RAILWAY_VOLUME_MOUNT_PATH`) y se verificó que un upload sobrevive un redeploy completo.

#### Puesta en producción Vercel (2026-10-07)
- Frontend desplegado en **https://b2b-insight.vercel.app** (proyecto `b2b-insight`, framework Vite, build `npm run build`, output `dist`, Node 22.x).
- **Trampa "Services"**: al desplegar con preset "Services", Vercel CLI inyecta en `vercel.json` un rewrite catch-all `/(.*) → service backend` + un bloque `services.backend` (root `backend`, entrypoint `src/index.ts`), con lo que Vercel compila el backend y la home responde 500. Fix: revertir `vercel.json` a solo los 2 rewrites y añadir **`.vercelignore` con `backend`** para que Vercel construya solo el frontend.
- `CORS_ORIGIN=https://b2b-insight.vercel.app` seteado en Railway y verificado: login con `Origin` → 200, preflight OPTIONS `/api/uploads/company-logo` → 204 con allow-origin.
- Flujo completo verificado: SPA en `/`, `/api/health` y `/uploads/*` reescritos a Railway, imagen persistida en el volume servida vía rewrite.

#### Pendiente
- ~~Importar repo en Vercel + setear CORS_ORIGIN~~ → hecho (ver "Puesta en producción Vercel (2026-10-07)" más abajo).
- Carga de productos reales de IMEX ESTADO + datos legales y logo; teléfono real para WhatsApp; rotar passwords temporales; verificación visual del PDF en producción; ERP Microsoft Dynamics.
