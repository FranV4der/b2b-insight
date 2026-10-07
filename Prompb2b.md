# PROMPT MAESTRO: Desarrollo de Plataforma Ecommerce B2B para Chile

---

## ROL Y OBJETIVO

Actúa como un arquitecto de software senior especializado en ecommerce B2B para el mercado chileno. Tu tarea es diseñar, especificar y guiar el desarrollo completo de una plataforma B2B robusta que integre los sistemas públicos de compras del Estado de Chile (ChileCompra y Convenio Marco) y el Servicio de Impuestos Internos (SII).

---

## CONTEXTO DEL PROYECTO

**Tipo de proyecto:** Plataforma ecommerce B2B (Business-to-Business)
**Mercado objetivo:** Chile
**Usuarios:** Empresas que venden a otras empresas y al sector público
**Requisito crítico:** Integración con sistemas gubernamentales chilenos

---

## STACK TECNOLÓGICO DEFINIDO

### Frontend
- **Framework:** React con Next.js (para SSR/SSG y SEO)
- **Lenguaje:** TypeScript
- **Estilos:** Tailwind CSS
- **Tablas de datos:** TanStack Table (para manejo masivo de productos)
- **Estado del servidor:** React Query
- **Formularios:** React Hook Form + Zod para validación
- **Despliegue:** Vercel

### Backend
- **Lenguaje:** Python 3.11+
- **Framework principal:** Django (para lógica de negocio compleja, ORM, admin)
- **Framework secundario:** Flask (para microservicios o APIs ligeras si es necesario)
- **APIs:** Django REST Framework
- **Tareas asíncronas:** Celery + Redis
- **Despliegue:** Railway

### Base de Datos
- **Principal:** PostgreSQL (obligatorio para integridad transaccional)
- **Caché y colas:** Redis

---

## CARACTERÍSTICAS FUNCIONALES OBLIGATORIAS

### 1. Gestión de Cuentas Multi-tenant B2B

**Sistema de registro y validación:**
- Registro de empresas con validación KYB (Know Your Business)
- Verificación de RUT empresarial
- Aprobación manual por administrador de la plataforma
- Asignación automática de categoría de cliente tras aprobación

**Roles jerárquicos por empresa cliente:**
- **Administrador:** Gestión total de cuenta, usuarios, presupuestos, configuración
- **Aprobador:** Revisa y aprueba órdenes de compra antes del envío
- **Comprador:** Crea pedidos, solicita aprobaciones, ve su historial
- **Visualizador:** Solo consulta catálogo y precios, no puede comprar

**Flujo de aprobaciones:**
- Configurable por monto de compra
- Configurable por categoría de producto
- Múltiples niveles de aprobación si es necesario
- Notificaciones automáticas por email y en-app
- Historial completo de aprobaciones con timestamps y usuarios

### 2. Catálogo y Precios Dinámicos

**Gestión de precios:**
- Listas de precios personalizadas por cliente individual
- Listas de precios por segmento de cliente
- Precios escalonados por volumen (tiered pricing)
- Descuentos por cantidad negociados contractualmente
- Opción de ocultar precios (solo visible tras login o solicitud de cotización)
- Precios con y sin IVA claramente diferenciados
- Vigencia temporal de precios promocionales

**Gestión de productos:**
- Productos con variantes complejas (talla, color, especificaciones técnicas)
- Documentos adjuntos por producto (fichas técnicas, certificados, MSDS, imágenes)
- Categorización jerárquica múltiple
- Búsqueda avanzada con filtros dinámicos
- Stock en tiempo real sincronizado con inventario

### 3. Experiencia de Compra B2B Optimizada

**Pedido Rápido (Quick Order):**
- Formulario para ingresar SKU + cantidad masivamente
- Carga de archivos CSV/Excel para pedidos por lotes
- Búsqueda por código de fabricante (MPN) o sinónimos
- Autocompletado inteligente de productos

**Listas de Compra Guardadas:**
- Pedidos frecuentes reutilizables con un clic
- Plantillas de pedido por proyecto o sucursal
- Compartir listas entre usuarios de la misma empresa

**Validaciones de Pedido:**
- Cantidad Mínima de Orden (MOQ) configurable por producto
- Múltiplos de venta (ej. cajas de 12 unidades)
- Validación de stock disponible en tiempo real
- Validación de crédito disponible del cliente
- Alertas de productos discontinuados o con reemplazo

**Solicitud de Muestras:**
- Flujo separado para solicitar samples antes de compra mayor
- Aprobación específica para muestras
- Tracking de muestras enviadas

### 4. Checkout y Pagos Complejos

**Órdenes de Compra (PO):**
- Campo obligatorio para número de PO del cliente
- Validación de formato de PO
- Asociación de PO con pedidos específicos

**Métodos de pago:**
- Línea de crédito (crédito 30/60/90 días) con límite asignado
- Transferencia bancaria con instrucciones
- Pago contra entrega
- Tarjeta corporativa (si aplica)
- Pago mixto (parte crédito, parte transferencia)

**Gestión de líneas de crédito:**
- Límite de crédito asignado por cliente
- Monitoreo de saldo disponible en tiempo real
- Alertas cuando se接近 al límite
- Bloqueo automático de pedidos si excede límite
- Renovación automática de crédito tras pago

**Logística de envío:**
- Múltiples direcciones de envío por pedido (split shipping)
- Programación de fechas de entrega futuras
- Cálculo de fletes complejos (por peso, volumen, pallets, zonas)
- Selección de transportista
- Tracking de envío integrado

### 5. Panel de Administración (Backoffice)

**Dashboard ejecutivo:**
- Ventas por período (día, semana, mes, año)
- Comparativa con período anterior
- Clientes activos vs inactivos
- Tasa de recompra
- Clientes en mora con montos
- Pedidos pendientes de aprobación
- Stock crítico

**Gestión de clientes:**
- Lista completa de clientes con filtros
- Asignación de listas de precios
- Configuración de líneas de crédito
- Historial de compras por cliente
- Comunicación con cliente (notas, recordatorios)

**Gestión de catálogo:**
- Creación, edición, eliminación de productos
- Gestión de inventario
- Alertas de stock bajo
- Importación masiva de productos (CSV/Excel)
- Gestión de categorías y atributos

**Reportes y exportación:**
- Reportes de ventas exportables (Excel, PDF)
- Reportes de inventario
- Reportes de clientes
- Reportes de productos más vendidos
- Reportes personalizados

**Logs de auditoría:**
- Registro completo de todas las acciones críticas
- Quién hizo qué, cuándo y desde dónde
- Retención mínima de 5 años
- Búsqueda y filtrado de logs

---

## INTEGRACIONES ESPECÍFICAS CHILE

### 1. ChileCompra (Mercado Público)

**APIs a integrar:**
- API de Consulta de Oportunidades: Obtener licitaciones públicas activas
- API de Órdenes de Compra: Recepción automática de OC del estado
- API de Catálogo Electrónico: Publicación de productos en Convenio Marco
- API de Facturación Electrónica: Integración con sistemas de facturación

**Flujo de integración:**
1. Sincronización automática de licitaciones cada 5-15 minutos
2. Notificación automática cuando hay licitaciones que matchean con productos del catálogo
3. Recepción de Órdenes de Compra desde ChileCompra → Creación automática de pedido en el sistema
4. Actualización de estado de pedidos → ChileCompra (confirmación, despacho, entrega)
5. Emisión de factura electrónica → SII → ChileCompra

**Consideraciones:**
- Manejo de errores y reintentos automáticos
- Logs detallados de todas las transacciones con ChileCompra
- Ambiente de certificación y ambiente de producción
- Cumplimiento de estándares de seguridad de ChileCompra

### 2. Convenio Marco

**Funcionalidades:**
- Publicación automática de productos acordados en convenio
- Sincronización de precios pactados en el convenio
- Gestión de catálogos específicos por convenio
- Validación de cumplimiento de plazos de entrega
- Reportes de cumplimiento de convenio (KPIs)
- Alertas de productos fuera de convenio

### 3. Servicio de Impuestos Internos (SII)

**Integración con facturación electrónica:**
- Emisión automática de DTE (Documento Tributario Electrónico):
  - Facturas electrónicas
  - Boletas electrónicas (si aplica)
  - Guías de despacho
  - Notas de crédito
  - Notas de débito
- Envío automático al SII
- Generación de PDF con timbre electrónico
- Libro de compras y ventas automático
- Manejo de folios electrónicos
- Integración con proveedor de facturación (ej. Haulmer, Bsale, Factus)

**Consideraciones:**
- Cumplimiento de todas las normativas del SII
- Manejo de diferentes tipos de documentos según situación
- Almacenamiento seguro de DTEs por 6 años (requisito legal)
- Firma electrónica de documentos

### 4. ERP Externo (Si aplica)

**Sincronización bidireccional:**
- Inventario: Stock actualizado en tiempo real
- Clientes: Datos maestros sincronizados
- Precios: Listas de precios actualizadas
- Facturación: Documentos enviados al ERP
- Pedidos: Órdenes de compra reflejadas en ERP

**Mecanismos:**
- Webhooks para actualización en tiempo real
- APIs REST para sincronización programada
- Cola de mensajes para procesamiento asíncrono
- Manejo de conflictos y resolución de duplicados

---

## ARQUITECTURA DEL SISTEMA

### Estructura de Módulos Django

**Aplicaciones principales:**
- **accounts:** Gestión de usuarios, empresas, roles, permisos
- **catalog:** Productos, categorías, precios, inventario
- **orders:** Pedidos, carritos, aprobaciones, historial
- **payments:** Líneas de crédito, pagos, transacciones
- **chilecompra:** Integración con APIs de ChileCompra
- **convenio_marco:** Gestión de convenios marco
- **sii:** Facturación electrónica, DTEs, folios
- **notifications:** Sistema de notificaciones (email, in-app)
- **admin_panel:** Backoffice personalizado
- **reports:** Generación de reportes y dashboards
- **integrations:** Clientes para APIs externas (ERP, etc.)
- **audit:** Logs de auditoría y tracking

### Modelos de Datos Clave

**Entidades principales:**
- Company (Empresa cliente/proveedor)
- User (Usuario con roles específicos)
- Product (Producto con variantes y atributos)
- Category (Categoría jerárquica)
- PriceList (Lista de precios por cliente/segmento)
- Order (Pedido con estado, aprobaciones, totales)
- OrderLine (Líneas de pedido con productos y cantidades)
- CreditLine (Línea de crédito asignada a cliente)
- Payment (Transacción de pago)
- Approval (Flujo de aprobación de pedido)
- ChileCompraOpportunity (Licitación pública)
- ChileCompraOrder (Orden de compra del estado)
- ElectronicDocument (DTE - Factura, guía, etc.)
- AuditLog (Registro de auditoría)

### APIs REST

**Diseño de APIs:**
- Autenticación: JWT para usuarios, API Keys para integraciones
- Rate limiting para APIs públicas
- Versionado de APIs (v1, v2, etc.)
- Documentación automática con drf-spectacular (OpenAPI/Swagger)
- Paginación y filtros avanzados
- Respuestas estandarizadas con códigos HTTP apropiados
- Manejo centralizado de errores

### Tareas Asíncronas (Celery)

**Tareas programadas:**
- Sincronización con ChileCompra (cada 5-15 min)
- Sincronización de inventario con ERP
- Envío de notificaciones por email
- Generación de reportes pesados
- Procesamiento de facturas electrónicas
- Limpieza de sesiones expiradas
- Backups automáticos

**Tareas disparadas por eventos:**
- Envío de emails transaccionales
- Actualización de métricas en tiempo real
- Sincronización de datos con sistemas externos
- Generación de PDFs

---

## SEGURIDAD Y CUMPLIMIENTO

### Autenticación y Autorización

**Autenticación:**
- Django Allauth para autenticación robusta
- 2FA (Two-Factor Authentication) obligatorio para administradores
- Opción de 2FA para usuarios regulares
- Sesiones con timeout configurable
- Bloqueo de cuenta tras intentos fallidos

**Autorización:**
- RBAC (Role-Based Access Control) granular
- Permisos a nivel de objeto (no solo de modelo)
- Validación de permisos en cada endpoint de API
- Separación clara entre permisos de plataforma y permisos de empresa

### Protección de Datos

**Encriptación:**
- HTTPS obligatorio en todos los endpoints
- Encriptación de datos sensibles en base de datos (RUT, datos bancarios)
- Hash seguro de contraseñas (bcrypt o Argon2)
- Encriptación de documentos tributarios en reposo

**Validación:**
- Validación exhaustiva de todos los inputs
- Protección contra SQL injection (uso de ORM)
- Protección contra XSS (sanitización de outputs)
- Protección contra CSRF en todas las operaciones
- Rate limiting para prevenir ataques de fuerza bruta

### Cumplimiento Legal Chile

**Protección de Datos Personales (Ley 19.628):**
- Política de privacidad clara y accesible
- Consentimiento explícito para tratamiento de datos
- Derecho a acceder, rectificar y eliminar datos
- Registro de tratamientos de datos

**Facturación Electrónica (SII):**
- Cumplimiento de todas las normativas del SII
- Almacenamiento de DTEs por mínimo 6 años
- Firma electrónica válida
- Envío automático al SII

**Auditoría:**
- Logs de auditoría completos
- Retención mínima de 5 años
- Trazabilidad de todas las transacciones
- Imposibilidad de alterar logs (inmutabilidad)

---

## DESPLIEGUE Y OPERACIONES

### Vercel (Frontend)

**Configuración:**
- Deploy automático desde Git (rama main/production)
- Preview deployments para pull requests
- Variables de entorno configuradas para cada ambiente
- Dominio personalizado con SSL automático
- Optimización automática de imágenes y assets
- Edge caching para contenido estático

### Railway (Backend)

**Configuración:**
- Deploy desde Dockerfile o Nixpacks
- Variables de entorno seguras
- Auto-scaling configurado según carga
- Health checks para monitoreo de salud
- Logs centralizados y accesibles
- Base de datos PostgreSQL gestionada
- Backups automáticos diarios

### CI/CD Pipeline

**Proceso de integración continua:**
1. Linting de código (flake8, black para Python; eslint para JS)
2. Tests unitarios (pytest para Python, jest para JS)
3. Tests de integración para APIs
4. Tests E2E para flujos críticos
5. Análisis de seguridad (dependencias vulnerables)
6. Build de imágenes Docker
7. Deploy automático a ambiente de staging
8. Tests de smoke en staging
9. Deploy a producción tras aprobación manual

**Ambientes:**
- Development: Local con Docker Compose
- Staging: Réplica de producción para testing
- Production: Ambiente productivo

---

## RENDIMIENTO Y ESCALABILIDAD

### Optimización de Rendimiento

**Caché:**
- Caché agresivo con Redis para:
  - Catálogo de productos (con invalidación automática)
  - Listas de precios
  - Datos de empresa del usuario
  - Configuraciones globales
- Caché de queries pesadas
- Caché de páginas estáticas

**Base de datos:**
- Indexación adecuada en todas las tablas
- Optimización de queries Django (select_related, prefetch_related)
- Uso de transacciones donde sea necesario
- Particionamiento de tablas grandes si es necesario

**Frontend:**
- Code splitting con Next.js
- Lazy loading de componentes
- Optimización de imágenes (WebP, lazy loading)
- Minimización de bundles

### Escalabilidad

**Arquitectura:**
- Backend stateless (sesiones en Redis, no en memoria)
- Preparado para escalar horizontalmente
- Base de datos con réplicas de lectura si es necesario
- Colas de tareas para procesamiento asíncrono
- CDN para assets estáticos

**Monitoreo:**
- Sentry para tracking de errores en tiempo real
- Logs estructurados (JSON) para fácil análisis
- Métricas de rendimiento (APM)
- Alertas automáticas por email/Slack ante problemas
- Dashboard de salud del sistema

---

## TESTING Y CALIDAD

### Estrategia de Testing

**Tests unitarios:**
- Cobertura mínima del 80% en código crítico
- Tests para toda la lógica de negocio
- Tests para validaciones y reglas

**Tests de integración:**
- Tests para todas las APIs REST
- Tests para integraciones con sistemas externos (mockeados)
- Tests para flujos completos de compra

**Tests E2E:**
- Flujos críticos: registro, compra, aprobación, facturación
- Flujos de integración con ChileCompra
- Flujos de facturación electrónica

**Tests de carga:**
- Simulación de alto tráfico
- Identificación de cuellos de botella
- Validación de escalabilidad

### Calidad de Código

**Estándares:**
- PEP 8 para Python
- ESLint + Prettier para JavaScript/TypeScript
- Commits semánticos
- Pull requests con revisión obligatoria
- Documentación inline para código complejo

---

## DOCUMENTACIÓN

### Documentación Técnica

**APIs:**
- Documentación OpenAPI/Swagger automática
- Ejemplos de requests y responses
- Guías de autenticación

**Arquitectura:**
- Diagrama C4 (Context, Containers, Components, Code)
- Diagramas de secuencia para flujos críticos
- Decisiones de arquitectura documentadas (ADRs)

**Desarrollo:**
- README completo con setup local
- Guías de desarrollo y convenciones
- Documentación de integraciones externas
- Troubleshooting común

### Documentación de Usuario

**Manuales:**
- Guía de usuario para compradores B2B
- Guía de administrador de empresa cliente
- Guía de administrador de plataforma
- FAQ y troubleshooting

---

## FLUJOS CRÍTICOS A IMPLEMENTAR

### Flujo 1: Registro y Aprobación de Empresa

1. Empresa se registra en la plataforma
2. Sistema solicita documentos (RUT, cámara de comercio, etc.)
3. Administrador de plataforma revisa y valida
4. Administrador asigna categoría de cliente y lista de precios
5. Administrador asigna línea de crédito si aplica
6. Empresa recibe notificación de aprobación
7. Empresa puede comenzar a comprar

### Flujo 2: Compra con Aprobación Interna

1. Comprador inicia sesión
2. Busca productos y agrega al carrito
3. Sistema valida MOQ, stock y crédito disponible
4. Comprador envía pedido para aprobación
5. Aprobador recibe notificación
6. Aprobador revisa y aprueba/rechaza
7. Si aprueba: pedido se envía al proveedor
8. Proveedor confirma y prepara envío
9. Sistema genera factura electrónica → SII
10. Sistema notifica a ChileCompra si es OC pública
11. Producto se despacha con tracking
12. Cliente recibe y confirma

### Flujo 3: Integración con ChileCompra

1. Sistema sincroniza licitaciones cada X minutos
2. Sistema identifica licitaciones matching con productos
3. Notifica a proveedores relevantes
4. Proveedor oferta en licitación
5. Estado emite Orden de Compra
6. Sistema recibe OC automáticamente
7. Sistema crea pedido interno
8. Proveedor despacha
9. Sistema actualiza estado en ChileCompra
10. Sistema emite factura electrónica
11. Sistema envía factura a ChileCompra

---

## CHECKLIST PRE-LANZAMIENTO

### Integraciones
- [ ] ChileCompra funcionando en ambiente de certificación
- [ ] ChileCompra funcionando en ambiente de producción
- [ ] Convenio Marco configurado y probado
- [ ] Facturación electrónica certificada con SII
- [ ] ERP integrado (si aplica)

### Funcionalidades
- [ ] Todos los flujos de aprobación configurados y probados
- [ ] Roles y permisos validados exhaustivamente
- [ ] Cálculos de precios y descuentos verificados
- [ ] Gestión de inventario funcionando
- [ ] Reportes generando correctamente

### Seguridad
- [ ] Tests de penetración realizados
- [ ] Encriptación de datos sensibles verificada
- [ ] Backups y recovery probados
- [ ] Políticas de seguridad documentadas
- [ ] Cumplimiento Ley 19.628 verificado

### Rendimiento
- [ ] Tests de carga realizados
- [ ] Optimización de queries verificada
- [ ] Caché configurado y funcionando
- [ ] Monitoreo y alertas configurados

### Documentación y Legal
- [ ] Documentación técnica completa
- [ ] Manuales de usuario disponibles
- [ ] Términos y condiciones actualizados
- [ ] Política de privacidad publicada
- [ ] Soporte técnico configurado

---

## CRITERIOS DE ÉXITO

**Funcionales:**
- 100% de las funcionalidades descritas implementadas y probadas
- Integraciones con ChileCompra y SII funcionando sin errores
- Flujos de aprobación configurables y operativos

**Técnicos:**
- Tiempo de respuesta < 2 segundos para operaciones críticas
- Disponibilidad > 99.5%
- Cobertura de tests > 80%
- Cero vulnerabilidades críticas

**Negocio:**
- Plataforma capaz de procesar pedidos de múltiples empresas simultáneamente
- Escalable para crecer en usuarios y transacciones
- Cumplimiento total de normativas chilenas

---

## INSTRUCCIONES FINALES

Utiliza este prompt como especificación completa para:
1. Diseñar la arquitectura del sistema
2. Planificar el desarrollo por módulos
3. Estimar tiempos y recursos
4. Guiar la implementación técnica
5. Validar que todas las funcionalidades estén cubiertas
6. Asegurar el cumplimiento de normativas chilenas

Prioriza la robustez, seguridad y cumplimiento legal sobre la velocidad de desarrollo. Cada integración con sistemas gubernamentales debe ser probada exhaustivamente antes de pasar a producción.

---

**Fin del prompt**
