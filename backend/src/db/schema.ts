import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  decimal,
  boolean,
  timestamp,
  primaryKey,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

// ─── PRODUCTS ──────────────────────────────────────────────

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    sku: varchar("sku", { length: 100 }).unique().notNull(),
    name: varchar("name", { length: 500 }).notNull(),
    description: text("description"),
    shortDesc: varchar("short_desc", { length: 1000 }),
    regularPrice: decimal("regular_price", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    priceChilecompra: decimal("price_chilecompra", { precision: 12, scale: 2 }),
    priceConvenioMarco: decimal("price_convenio_marco", {
      precision: 12,
      scale: 2,
    }),
    technicalSheetUrl: text("technical_sheet_url"),
    stock: integer("stock").notNull().default(0),
    minOrderQty: integer("min_order_qty").notNull().default(1),
    saleMultiple: integer("sale_multiple").notNull().default(1),
    mpn: varchar("mpn", { length: 100 }),
    // Dimensiones en centímetros; requeridas para mostrar las especificaciones
    // técnicas y habilitar los filtros por medidas del catálogo.
    lengthCm: decimal("length_cm", { precision: 10, scale: 2 }),
    widthCm: decimal("width_cm", { precision: 10, scale: 2 }),
    heightCm: decimal("height_cm", { precision: 10, scale: 2 }),
    weightKg: decimal("weight_kg", { precision: 10, scale: 3 }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    featured: boolean("featured").notNull().default(false),
    companyId: integer("company_id").references(() => companies.id, {
      onDelete: "set null",
    }),
    brandId: integer("brand_id").references(() => brands.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    statusIdx: index("idx_products_status").on(t.status),
    companyIdx: index("idx_products_company").on(t.companyId),
    brandIdx: index("idx_products_brand").on(t.brandId),
    nameSearchIdx: index("idx_products_name_search").on(t.name),
  })
);

// ─── BRANDS ────────────────────────────────────────────────

export const brands = pgTable("brands", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).unique().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── CATEGORIES ────────────────────────────────────────────

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).unique().notNull(),
  parentId: integer("parent_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const productCategories = pgTable(
  "product_categories",
  {
    productId: integer("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    categoryId: integer("category_id")
      .references(() => categories.id, { onDelete: "cascade" })
      .notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.productId, t.categoryId] }),
  })
);

// ─── PRODUCT IMAGES ────────────────────────────────────────

export const productImages = pgTable("product_images", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .references(() => products.id, { onDelete: "cascade" })
    .notNull(),
  url: text("url").notNull(),
  alt: varchar("alt", { length: 500 }),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── PRODUCT DOCUMENTS ──────────────────────────────────────
// Adjuntos PDF por producto: hojas de seguridad, manuales y fichas técnicas.
// Un producto puede tener varios, a diferencia de `products.technicalSheetUrl`
// que guarda una única ficha principal.

export const PRODUCT_DOC_TYPES = [
  "hoja_seguridad",
  "manual",
  "ficha_tecnica",
  "otro",
] as const;
export type ProductDocType = (typeof PRODUCT_DOC_TYPES)[number];

export const productDocuments = pgTable(
  "product_documents",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    docType: varchar("doc_type", { length: 30 }).notNull().default("otro"),
    title: varchar("title", { length: 255 }).notNull(),
    fileUrl: text("file_url").notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    fileSize: integer("file_size").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    productIdx: index("idx_product_documents_product_id").on(t.productId),
  })
);

// ─── COMPANIES ─────────────────────────────────────────────

export const companies = pgTable(
  "companies",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).unique().notNull(),
    legalName: varchar("legal_name", { length: 255 }),
    businessActivity: varchar("business_activity", { length: 255 }),
    rut: varchar("rut", { length: 20 }),
    address: text("address"),
    commune: varchar("commune", { length: 100 }),
    region: varchar("region", { length: 100 }),
    phone: varchar("phone", { length: 50 }),
    email: varchar("email", { length: 255 }),
    website: varchar("website", { length: 500 }),
    logoUrl: text("logo_url"),
    contactName: varchar("contact_name", { length: 255 }),
    contactRole: varchar("contact_role", { length: 100 }),
    contactEmail: varchar("contact_email", { length: 255 }),
    contactPhone: varchar("contact_phone", { length: 50 }),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    approvedAt: timestamp("approved_at"),
    approvedBy: integer("approved_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    statusIdx: index("idx_companies_status").on(t.status),
    slugIdx: index("idx_companies_slug").on(t.slug),
  })
);

// ─── CUSTOMERS (compradores) ─────────────────────────────
//
// Compradores de los vendedores registrados en `companies`. Puede ser una
// empresa o una persona natural (`kind`), por eso el RUT es opcional.

export const CUSTOMER_KINDS = ["persona", "empresa"] as const;
export type CustomerKind = (typeof CUSTOMER_KINDS)[number];

export const CUSTOMER_TYPES = ["normal", "chilecompra", "both"] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const CUSTOMER_STATUSES = ["pending", "active", "suspended"] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

// Condiciones de pago admitidas: de contado o a 30, 60 o 90 días.
export const PAYMENT_TERMS = ["contado", "30", "60", "90"] as const;
export type PaymentTerm = (typeof PAYMENT_TERMS)[number];

export const customers = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    // Vendedor al que pertenece el cliente: acota qué compradores ve cada admin de
    // empresa. `null` solo para clientes de la plataforma sin vendedor asignado.
    companyId: integer("company_id").references(() => companies.id, {
      onDelete: "set null",
    }),
    kind: varchar("kind", { length: 20 }).notNull().default("empresa"),
    name: varchar("name", { length: 255 }).notNull(),
    rut: varchar("rut", { length: 20 }),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 50 }),
    // `address/commune/region` = dirección de envío.
    address: text("address"),
    commune: varchar("commune", { length: 100 }),
    region: varchar("region", { length: 100 }),
    // Dirección de facturación, cuando es distinta de la de envío.
    billingAddress: text("billing_address"),
    billingCommune: varchar("billing_commune", { length: 100 }),
    billingRegion: varchar("billing_region", { length: 100 }),
    type: varchar("type", { length: 20 }).notNull().default("normal"),
    // Condición de pago pactada: "contado" | "30" | "60" | "90" días.
    paymentTerms: varchar("payment_terms", { length: 20 }),
    priceListId: integer("price_list_id"),
    creditLimit: decimal("credit_limit", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    creditUsed: decimal("credit_used", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    statusIdx: index("idx_customers_status").on(t.status),
    rutIdx: index("idx_customers_rut").on(t.rut),
    companyIdx: index("idx_customers_company_id").on(t.companyId),
  })
);

// ─── USERS ─────────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: varchar("email", { length: 255 }).unique().notNull(),
    password: varchar("password", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    role: varchar("role", { length: 30 }).notNull().default("buyer"),
    active: boolean("active").notNull().default(true),
    isMercadoPublico: boolean("is_mercado_publico").notNull().default(false),
    phone: varchar("phone", { length: 50 }),
    twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
    lastLoginAt: timestamp("last_login_at"),
    failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until"),
    companyId: integer("company_id").references(() => companies.id, {
      onDelete: "set null",
    }),
    customerId: integer("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    companyIdx: index("idx_users_company").on(t.companyId),
    customerIdx: index("idx_users_customer").on(t.customerId),
    emailIdx: index("idx_users_email").on(t.email),
  })
);

// ─── QUOTATIONS ────────────────────────────────────────────

export interface QuotationItemData {
  productId: number;
  name: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
}

export const quotations = pgTable(
  "quotations",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    companyId: integer("company_id").references(() => companies.id, {
      onDelete: "set null",
    }),
    customerId: integer("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    licitacionCode: varchar("licitacion_code", { length: 100 }),
    userType: varchar("user_type", { length: 20 }).notNull(),
    items: jsonb("items").$type<QuotationItemData[]>().notNull(),
    total: decimal("total", { precision: 12, scale: 2 }).notNull(),
    cotizanteName: varchar("cotizante_name", { length: 255 }),
    cotizanteEmail: varchar("cotizante_email", { length: 255 }),
    cotizantePhone: varchar("cotizante_phone", { length: 50 }),
    cotizanteInstitution: varchar("cotizante_institution", { length: 255 }),
    cotizantePosition: varchar("cotizante_position", { length: 255 }),
    cotizanteRut: varchar("cotizante_rut", { length: 20 }),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    companyIdx: index("idx_quotations_company").on(t.companyId),
    customerIdx: index("idx_quotations_customer").on(t.customerId),
    statusIdx: index("idx_quotations_status").on(t.status),
  })
);

// ─── ORDERS ────────────────────────────────────────────────

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    orderNumber: varchar("order_number", { length: 50 }).unique().notNull(),
    companyId: integer("company_id").references(() => companies.id, {
      onDelete: "set null",
    }),
    customerId: integer("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    buyerName: varchar("buyer_name", { length: 255 }),
    buyerEmail: varchar("buyer_email", { length: 255 }),
    buyerRut: varchar("buyer_rut", { length: 20 }),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    quotationId: integer("quotation_id").references(() => quotations.id, {
      onDelete: "set null",
    }),
    status: varchar("status", { length: 30 }).notNull().default("draft"),
    channel: varchar("channel", { length: 20 }).notNull().default("retail"),
    licitacionCode: varchar("licitacion_code", { length: 100 }),
    subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull(),
    tax: decimal("tax", { precision: 12, scale: 2 }).notNull().default("0"),
    total: decimal("total", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("CLP"),
    paymentMethod: varchar("payment_method", { length: 30 }),
    creditUsed: decimal("credit_used", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    shippingAddress: text("shipping_address"),
    shippingNotes: text("shipping_notes"),
    notes: text("notes"),
    poNumber: varchar("po_number", { length: 100 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    companyIdx: index("idx_orders_company").on(t.companyId),
    customerIdx: index("idx_orders_customer").on(t.customerId),
    statusIdx: index("idx_orders_status").on(t.status),
    userIdx: index("idx_orders_user").on(t.userId),
    poIdx: index("idx_orders_po").on(t.poNumber),
  })
);

// ─── ORDER ITEMS ───────────────────────────────────────────

export const orderItems = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .references(() => orders.id, { onDelete: "cascade" })
      .notNull(),
    productId: integer("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    productName: varchar("product_name", { length: 500 }).notNull(),
    productSku: varchar("product_sku", { length: 100 }),
    quantity: integer("quantity").notNull(),
    unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull(),
    totalPrice: decimal("total_price", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    orderIdx: index("idx_order_items_order").on(t.orderId),
  })
);

// ─── APPROVALS ─────────────────────────────────────────────

export const approvals = pgTable(
  "approvals",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .references(() => orders.id, { onDelete: "cascade" })
      .notNull(),
    approverId: integer("approver_id").references(() => users.id, {
      onDelete: "set null",
    }),
    level: integer("level").notNull().default(1),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
  },
  (t) => ({
    orderIdx: index("idx_approvals_order").on(t.orderId),
    approverIdx: index("idx_approvals_approver").on(t.approverId),
    statusIdx: index("idx_approvals_status").on(t.status),
  })
);

// ─── APPROVAL RULES ────────────────────────────────────────

export const approvalRules = pgTable(
  "approval_rules",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    minAmount: decimal("min_amount", { precision: 12, scale: 2 }),
    maxAmount: decimal("max_amount", { precision: 12, scale: 2 }),
    categoryIds: integer("category_ids").array(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    companyIdx: index("idx_approval_rules_company").on(t.companyId),
  })
);

export const approvalRuleLevels = pgTable(
  "approval_rule_levels",
  {
    id: serial("id").primaryKey(),
    ruleId: integer("rule_id")
      .references(() => approvalRules.id, { onDelete: "cascade" })
      .notNull(),
    level: integer("level").notNull(),
    approverRole: varchar("approver_role", { length: 30 }).notNull(),
    approverIds: integer("approver_ids").array(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    ruleIdx: index("idx_approval_rule_levels_rule").on(t.ruleId),
  })
);

// ─── PRICE LISTS ───────────────────────────────────────────

export const priceLists = pgTable(
  "price_lists",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    companyId: integer("company_id").references(() => companies.id, {
      onDelete: "cascade",
    }),
    isActive: boolean("is_active").notNull().default(true),
    isMpPriceList: boolean("is_mp_price_list").notNull().default(false),
    validFrom: timestamp("valid_from"),
    validUntil: timestamp("valid_until"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    companyIdx: index("idx_price_lists_company").on(t.companyId),
  })
);

export const priceListItems = pgTable(
  "price_list_items",
  {
    id: serial("id").primaryKey(),
    priceListId: integer("price_list_id")
      .references(() => priceLists.id, { onDelete: "cascade" })
      .notNull(),
    productId: integer("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    price: decimal("price", { precision: 12, scale: 2 }).notNull(),
    discount: decimal("discount", { precision: 5, scale: 2 }).default("0"),
    minQuantity: integer("min_quantity").notNull().default(1),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    priceListIdx: index("idx_price_list_items_list").on(t.priceListId),
    productIdx: index("idx_price_list_items_product").on(t.productId),
  })
);

// ─── NOTIFICATIONS ─────────────────────────────────────────

export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    message: text("message").notNull(),
    type: varchar("type", { length: 30 }),
    referenceId: integer("reference_id"),
    referenceType: varchar("reference_type", { length: 50 }),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("idx_notifications_user").on(t.userId),
    readIdx: index("idx_notifications_read").on(t.isRead),
  })
);

// ─── AUDIT LOGS ────────────────────────────────────────────

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    companyId: integer("company_id").references(() => companies.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 50 }).notNull(),
    entityType: varchar("entity_type", { length: 50 }).notNull(),
    entityId: integer("entity_id"),
    oldValues: jsonb("old_values"),
    newValues: jsonb("new_values"),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("idx_audit_logs_user").on(t.userId),
    companyIdx: index("idx_audit_logs_company").on(t.companyId),
    entityIdx: index("idx_audit_logs_entity").on(t.entityType, t.entityId),
    actionIdx: index("idx_audit_logs_action").on(t.action),
  })
);
