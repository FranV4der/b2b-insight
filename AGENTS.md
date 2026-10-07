# insight-b2b

Plataforma B2B para cotizaciones de ChileCompra y Convenio Marco.
Gestión propia de productos (sin WooCommerce). Conecta con la API de Mercado Público para licitaciones.

React 19 + TypeScript 6 + Vite 8. SPA sin router, sin testing framework.

## Estructura

```
insight-b2b/
├── backend/              # Express + Drizzle + PostgreSQL
│   ├── src/
│   │   ├── index.ts      # Entry point Express
│   │   ├── db/
│   │   │   ├── schema.ts # Tablas: products, categories, product_categories, product_images
│   │   │   ├── index.ts  # Cliente Drizzle
│   │   │   └── migrate.ts
│   │   ├── routes/
│   │   │   ├── products.ts    # CRUD productos (GET, POST, PUT, DELETE)
│   │   │   ├── categories.ts  # GET, POST categorías
│   │   │   └── import.ts      # Importación Excel + template download
│   │   └── services/
│   ├── package.json
│   ├── tsconfig.json
│   ├── drizzle.config.ts
│   └── railway.json          # Deploy config
├── src/                  # Frontend React
│   ├── types/            # Tipos: product, quote, user, order, notification, mercadopublico
│   ├── services/         # api.ts (cliente backend), mercadopublico.ts (proxy Mercado Público)
│   ├── context/          # Estado global (userType, view, items[], licitacionCode, persistido)
│   ├── utils/            # cartStorage.ts (carrito por usuario en localStorage)
│   ├── components/       # Header, NotificationBell, ProductCard, AdminOrders, CompaniesManager, ...
│   ├── views/            # HomeView, CatalogView, CartView, OrdersView, OrderDetailView, AdminView
│   ├── App.tsx           # Entry point con routing por estado
│   └── App.css           # Estilos (incluye admin panel)
├── vite.config.ts        # Proxy: /api/* → backend; /api/mp → Mercado Público
├── .env.example          # Variables requeridas
└── CHANGELOG.md          # Historial de cambios
```

## Comandos

### Frontend

```sh
npm run dev       # vite dev server (con proxy a backend + Mercado Público)
npm run build     # tsc -b && vite build
npm run lint      # eslint .
npm run preview   # vite preview
```

### Backend

```sh
cd backend
npm install
cp .env.example .env     # Configurar DATABASE_URL y JWT_SECRET
npm run db:push           # Crear/actualizar tablas
npm run create:admin -- admin@tuempresa.cl <password> "Tu Nombre"
                          # Crea el admin de plataforma (company_id = NULL)
npm run create:company -- --name "IMEX ESTADO" --rut "96.185.309-7" \
                          --admin-email admin@imex.cl --admin-password <pass>
                          # Alta de VENDEDOR (valida RUT) + su usuario rol 'empresa'
npm run seed:users        # Usuarios demo; requiere empresa 'insumos-arcadia' + productos
npm run dev               # Express en http://localhost:3001
npm run build             # Compilar TypeScript
npm start                 # Ejecutar build compilado
```

## TypeScript

### Frontend

- `verbatimModuleSyntax: true` → usar `import type` para type-only imports
- `erasableSyntaxOnly: true` → no `enum`, no `namespace`
- `noUnusedLocals` / `noUnusedParameters` → ambos activos

### Backend

- `module: NodeNext` / `moduleResolution: NodeNext`
- `strict: true`
- Usar `.js` en imports de módulos locales

## Arquitectura

```
Frontend (Vercel)              Backend (Railway)              PostgreSQL (Railway)
┌─────────────────┐           ┌──────────────────┐           ┌──────────────┐
│ React + Vite    │──API──────│ Express + Drizzle │───────────│ products     │
│ (SPA)           │  /api/*   │ + xlsx parser     │           │ categories   │
└─────────────────┘           └──────────────────┘           └──────────────┘
```

## Flujo

1. Selección de tipo: ChileCompra | Convenio Marco
2. Exploración de productos (con búsqueda y paginación)
3. Agregar productos al carrito
4. ChileCompra: ingreso de código de licitación
5. Checkout y confirmación de pedido (con IVA inline)

## API Backend

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/products` | Listar (search, page, per_page, status, channel, category_id, filtros precio/stock/dimensiones) |
| GET | `/api/products/search` | Autocompletado por nombre/SKU (antes de `/:id`) |
| GET | `/api/products/:id` | Detalle con categorías y documentos |
| POST | `/api/products` | Crear producto |
| PUT | `/api/products/:id` | Actualizar producto |
| DELETE | `/api/products/:id` | Eliminar producto |
| POST | `/api/products/import` | Importar Excel (preview + confirm) |
| GET | `/api/products/template` | Descargar plantilla Excel |
| POST | `/api/orders` | Crear pedido (valida stock, **límite de crédito** y precios server-side, IVA 19%, comprador active; suma el total a `customers.credit_used`) |
| GET | `/api/orders` | Listar pedidos del comprador (paginado; `admin` ve todos) |
| GET | `/api/orders/:id` | Detalle de pedido con ítems |
| GET | `/api/orders/:id/pdf` | Descargar PDF del pedido (comprador o proveedor con acceso) |
| POST | `/api/orders/:id/cancel` | Cancelar pedido (devuelve stock, solo pending/confirmed) |
| GET | `/api/orders/admin` | Pedidos que contienen productos del vendedor (paginado, por estado) |
| GET | `/api/orders/admin/:id` | Detalle de pedido对这个 vendedor (acota por `orders.company_id`) |
| PUT | `/api/orders/:id/status` | Avanzar estado del pedido (pending→confirmed→shipped→delivered) |
| GET | `/api/companies` | Listar **vendedores** (`admin` ve todos; `empresa` solo el suyo) |
| POST | `/api/companies` | Crear vendedor (solo `admin`; valida RUT y unicidad de slug) |
| PUT | `/api/companies/:id` | Editar vendedor (acota por `scopeCompanyId`) |
| GET | `/api/customers` | Listar **compradores** (con búsqueda) |
| POST | `/api/customers` | Crear comprador (solo `admin`) |
| PUT | `/api/customers/:id` | Editar comprador (tipo, estado, lista de precio, crédito) |
| GET | `/api/notifications` | Notificaciones del usuario + contador no leídas |
| PUT | `/api/notifications/:id/read` | Marcar notificación como leída |
| PUT | `/api/notifications/read-all` | Marcar todas como leídas |
| GET | `/api/categories` | Listar categorías |
| POST | `/api/categories` | Crear categoría |
| POST | `/api/quotes` | Crear cotización (infiere `companyId` de los productos; `total` se guarda como neto) |
| GET | `/api/quotes` | Listar cotizaciones (paginado; `admin` todas, `empresa` su vendedor, `cotizador` las propias; incluye `sellerName`/`sellerPhone`) |
| GET | `/api/quotes/:id` | Detalle de cotización (acotado por `quoteScope`) |
| PUT | `/api/quotes/:id/status` | Cambiar estado de cotización (`pending`/`approved`/`rejected`/`converted`; `empresa`/`admin`) |
| GET | `/api/quotes/:id/pdf` | Descargar PDF de cotización (total + IVA 19%) |
| GET | `/api/quotes/stats` | Resumen para el dashboard (`empresa`/`admin`) |
| POST | `/api/uploads/:id/documents` | Subir documento adjunto (PDF ≤ 10MB, campo `files`, tipo=hoja_seguridad/manual/ficha_tecnica/otro) |
| DELETE | `/api/uploads/:id/documents/:docId` | Eliminar documento adjunto (borra también el archivo en disco) |
| POST | `/api/uploads/company-logo` | Subir logo del vendedor (imagen ≤ 2MB, campo `logo`; `empresa` lo sube a su propia empresa, `admin` puede pasar `companyId`) |

> Adjuntos e imágenes de productos viven en `/api/uploads/*` (multer, `backend/uploads/`): `POST|GET /:id/images`, `POST /:id/technical-sheet`, `POST|GET /:id/documents`, `DELETE /:id/images/:imageId`, `DELETE /:id/technical-sheet`, `DELETE /:id/documents/:docId`. El router requiere `requireAuth` + `requireEmpresa`. El archivo se sirve desde `/uploads/...` (static). Las imágenes subidas se optimizan con `sharp` (`backend/src/services/image.ts`): máx. 1200px y re-codificadas a WebP (logos: 512px). `GET /api/quotes` acota por `quotations.company_id` para `empresa` (el `admin` ve todas); el `cotizador` ve las propias.

## Mercado Público API

- Proxy en Vite: `/api/mp/*` → `api.mercadopublico.cl/servicios/v1/publico`
- Ticket inyectado server-side (nunca expuesto al cliente)
- Servicio: `src/services/mercadopublico.ts` → `getLicitacionByCode(codigo)`
- Componente: `src/components/LicitacionInfo.tsx` muestra datos de la licitación

## Variables de Entorno

### Frontend (`.env`)

- `API_BASE_URL` → URL del backend (default: `http://localhost:3001`)
- `MERCADO_PUBLICO_TICKET` → Ticket de API de Mercado Público

### Backend (`.env`)

- `DATABASE_URL` → Connection string de PostgreSQL
- `JWT_SECRET` → Secreto de firma de los tokens de sesión (obligatorio). Generar con `openssl rand -base64 48`. Rotarlo invalida todos los tokens emitidos
- `PORT` → Puerto del servidor (default: 3001)
- `CORS_ORIGIN` → Origen permitido (default: `http://localhost:5173`)
- `SMTP_HOST` → Host SMTP (opcional; sin este valor las notificaciones quedan solo in-app)
- `SMTP_PORT` → Puerto SMTP (default: 587)
- `SMTP_SECURE` → `true`/`false` (TLS)
- `SMTP_USER` / `SMTP_PASS` → Credenciales SMTP (opcional, permite envío sin auth)
- `SMTP_FROM` → Remitente (default: `no-reply@insightb2b.cl`)

## Modelo de Negocio: Vendedor vs Comprador

`companies` son los **vendedores** (quienes publican catálogo y atienden pedidos). `customers` son los **compradores** (quienes compran). Son entidades distintas con campos distintos:

| | Vendedor (`companies`) | Comprador (`customers`) |
|---|---|---|
| Identidad | Razón social, giro, logo, contacto | `kind`: `persona` \| `empresa` |
| Comercial | `status` del vendedor | `type`, `priceListId`, `creditLimit`, `creditUsed`, `status` |
| Pertenencia | cada cliente tiene `company_id` → su vendedor | |
| Precio | precios en `products` / `price_lists` | qué lista y canal aplica (`resolvePriceContext`) |

**Una persona natural puede comprar sin organización**: el registro público crea un `customers` con `kind='persona'` y `users.customer_id` apuntando a él. Un usuario legacy sin `customer_id` sigue pudiendo comprar, pero sin lista de precio ni canal (solo operar sobre sus propios pedidos).

## Roles y Permisos

| Rol | Alcance | `company_id` (vendedor) | `customer_id` (comprador) |
|---|---|---|---|
| `admin` | Administrador de plataforma: ve y gestiona todos los vendedores, compradores, usuarios, productos, listas de precio, pedidos y cotizaciones | `NULL` | `NULL` |
| `empresa` | Administrador del vendedor: sus datos, usuarios, catálogo, listas de precio, **sus clientes** y los pedidos que contienen sus productos | su vendedor | `NULL` |
| `cotizador` | Comprador: catálogo, carrito, cotizaciones y sus propios pedidos | `NULL` | su comprador |

`users.role` es `varchar(30)` validado contra `ROLES` en `backend/src/roles.ts`.

Ambos punteros son **nullable** (`ON DELETE SET NULL`): borrar un vendedor o comprador no deja filas de `users` huérfanas.

- `scopeCompanyId(auth)` (`backend/src/middleware/auth.ts`) → `null` para `admin`: las queries **omiten** el filtro de vendedor.
- `scopeCustomerId(auth)` → `null` para `admin` y `empresa`: las queries de comprador **omiten** el filtro solo para `admin`; para `cotizador` se acota por `customer_id`, y si es `NULL` se cae a `userId` para que nunca vea pedidos ajenos.
- `GET|POST|PUT /api/customers` — el `admin` ve y gestiona todos los clientes; el rol `empresa` queda acotado a `customers.company_id = auth.companyId` (404 al tocar un cliente ajeno) y **siempre** crea clientes para su vendedor, ignorando un `companyId` del body; el `cotizador` solo ve y edita su propia ficha.
- `POST /api/orders` — el `company_id` (vendedor) se **infiere de los productos**; si el carrito mezcla vendedores queda `NULL`.
- `GET|PUT /api/users/company` — responde 400 para el admin (no tiene vendedor propio)
- `POST /api/price-lists`, `POST /api/users` — el admin debe indicar `companyId` destinatario

### Aislamiento por empresa (frontend)

`src/context/AppContext.tsx` persiste el carrito **por email de usuario** (`insight-b2b.cart.v1.<email>`) mediante `src/utils/cartStorage.ts`. Al cerrar sesión el carrito del usuario se borra. Un carrito heredado sin sufijo (versión anterior, compartido entre sesiones) se elimina con `purgeLegacyCart()`.

`Header.tsx` y `AdminView.tsx` deben usar `canManage = isEmpresa || isAdmin` en lugar de `isEmpresa`, para que el superadmin vea la navegación y las pestañas de gestión en lugar de las de cotizador.

## Esquema de Base de Datos

- `products` — SKU, nombre, descripción, precios (regular, chilecompra, convenio_marco), stock, estado, dimensiones (`length_cm`, `width_cm`, `height_cm`, `weight_kg`)
- `categories` — Nombre, slug, parent_id (categorías jerárquicas)
- `product_categories` — Relación many-to-many
- `product_images` — URLs de imágenes con orden
- `product_documents` — Documentos adjuntos (PDF): `product_id`, `title`, `file_path`, `file_url`, `doc_type` (`hoja_seguridad`/`manual`/`ficha_tecnica`/`otro`)
- `users` — `company_id` nullable (→ `companies`, vendedor) y `customer_id` nullable (→ `customers`, comprador)
- `companies` — **vendedor**: `legal_name`, `business_activity`, `commune`, `region`, `contact_name`, `contact_role`, `contact_email`, `contact_phone`, `status` (además de name, slug, rut, address, phone, email, website, logo_url)
- `customers` — **comprador**: `company_id` nullable (→ `companies`, vendedor que lo atiende), `kind`, `name`, `rut`, `email`, `phone`, `address`, `commune`, `region`, `type`, `priceListId`, `creditLimit`, `creditUsed`, `status`, `payment_terms` (`contado`/`30`/`60`/`90`), `billing_address`, `billing_commune`, `billing_region`
- `orders` — `customer_id` (comprador), `company_id` (vendedor) y snapshot inmutable `buyerName`/`buyerEmail`/`buyerRut`
- `quotations` — `customer_id` (comprador)

`backend/src/utils/validation.ts` centraliza `slugify`, `EMAIL_RE` y `normalizeRut` (valida el dígito verificador chileno y canonicaliza a `12345678-5`).

## Pendiente

- Cargar datos reales de IMEX ESTADO (RUT, razón social, giro, contactos, logo) y sus productos/listas de precio/clientes
- Reemplazar el teléfono de contacto de IMEX (`+56 9 8765 4321` es placeholder de demo para el botón WhatsApp)
- Cambiar el password temporal de `admin@imex.cl` (fue reseteado a `imex-admin-temp-2026` para las pruebas)
- Conectar con ERP Microsoft Dynamics para inserción de datos
- Verificación visual del PDF generado en producción
