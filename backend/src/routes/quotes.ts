import { Router } from "express";
import PDFDocument from "pdfkit";
import { db } from "../db/index.js";
import { quotations, products, companies, customers, users, orders, orderItems } from "../db/schema.js";
import { eq, sql, desc, and, inArray, type SQL } from "drizzle-orm";
import { requireAuth, requireEmpresa, requireCotizador, scopeCompanyId, scopeCustomerId } from "../middleware/auth.js";
import { notifyCompanyUsers, notifyCustomerUsers } from "../services/notifications.js";

export const quotesRouter = Router();

const TAX_RATE = 0.19;

function formatCLP(value: number): string {
  const parts = String(Math.round(value)).split("").reverse();
  const chunks: string[] = [];
  parts.forEach((ch, i) => {
    if (i > 0 && i % 3 === 0) chunks.push(".");
    chunks.push(ch);
  });
  return `$${chunks.reverse().join("")}`;
}

function formatDate(d: string | Date): string {
  const date = d instanceof Date ? d : new Date(d);
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

const USER_TYPE_LABELS: Record<string, string> = {
  chilecompra: "ChileCompra",
  "convenio-marco": "Convenio Marco",
};

const QUOTE_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobada",
  rejected: "Rechazada",
  converted: "Convertida en pedido",
};

/** Validez de una cotización: 15 días corridos desde su creación. */
const QUOTE_VALIDITY_DAYS = 15;

function quoteValidUntil(createdAt: Date | string): Date {
  return new Date(new Date(createdAt).getTime() + QUOTE_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
}

function generateOrderNumber(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `OC-${ymd}-${rand}`;
}

async function attachSeller(rows: Array<Record<string, unknown>>): Promise<Array<Record<string, unknown>>> {
  const companyIds = [...new Set(rows.map((r) => r.companyId).filter((c): c is number => c != null))];
  const quoteIds = [...new Set(rows.map((r) => r.id).filter((c): c is number => c != null))];
  const sellers = companyIds.length
    ? await db
        .select({ id: companies.id, name: companies.name, contactPhone: companies.contactPhone, phone: companies.phone })
        .from(companies)
        .where(inArray(companies.id, companyIds))
    : [];
  const linkedOrders = quoteIds.length
    ? await db
        .select({ id: orders.id, orderNumber: orders.orderNumber, quotationId: orders.quotationId, status: orders.status })
        .from(orders)
        .where(inArray(orders.quotationId, quoteIds))
    : [];
  const byId = new Map(sellers.map((s) => [s.id, s]));
  const orderByQuote = new Map(linkedOrders.map((o) => [o.quotationId as number, o]));
  return rows.map((r) => ({
    ...r,
    sellerName: r.companyId ? byId.get(r.companyId as number)?.name ?? null : null,
    sellerPhone: r.companyId ? byId.get(r.companyId as number)?.contactPhone ?? byId.get(r.companyId as number)?.phone ?? null : null,
    orderId: r.id ? orderByQuote.get(r.id as number)?.id ?? null : null,
    orderNumber: r.id ? orderByQuote.get(r.id as number)?.orderNumber ?? null : null,
    orderStatus: r.id ? orderByQuote.get(r.id as number)?.status ?? null : null,
    validUntil: r.createdAt ? quoteValidUntil(r.createdAt as string | Date).toISOString() : null,
  }));
}

/**
 * Construye la condición de acceso a una cotización: el admin de plataforma ve
 * todo, el vendedor solo las suyas y el comprador solo las propias.
 */
function quoteScope(id: number, auth: NonNullable<{ role?: string; companyId?: number | null; customerId?: number | null; userId?: number }>): SQL | undefined {
  const target = eq(quotations.id, id);
  if (auth.role === "admin") return target;
  if (auth.role === "empresa") {
    return and(target, eq(quotations.companyId, auth.companyId ?? -1));
  }
  if (auth.role === "cotizador") {
    if (auth.customerId) return and(target, eq(quotations.customerId, auth.customerId));
    return and(target, eq(quotations.userId, auth.userId ?? -1));
  }
  return undefined;
}

quotesRouter.post("/", requireAuth, requireCotizador, async (req, res) => {
  try {
    const auth = req.auth!;
    const {
      licitacionCode,
      userType,
      items,
      total,
      cotizanteName,
      cotizanteEmail,
      cotizantePhone,
      cotizanteInstitution,
      cotizantePosition,
      cotizanteRut,
    } = req.body;

    if (!userType || !items?.length || total === undefined) {
      res.status(400).json({ error: "userType, items y total son requeridos" });
      return;
    }

    if (userType !== "chilecompra" && userType !== "convenio-marco") {
      res.status(400).json({ error: "userType debe ser 'chilecompra' o 'convenio-marco'" });
      return;
    }

    // El vendedor se infiere de los productos cotizados: si el carrito mezcla
    // varios vendedores queda `null` (no hay a quién asignarle la cotización).
    const productIds = items
      .map((item: { productId?: number }) => Number(item.productId))
      .filter((n: number) => Number.isInteger(n) && n > 0);
    const sellers = productIds.length
      ? await db
          .selectDistinct({ companyId: products.companyId })
          .from(products)
          .where(inArray(products.id, productIds))
      : [];
    const uniqueSellers = sellers.map((r) => r.companyId).filter((v): v is number => v != null);
    const sellerCompanyId = uniqueSellers.length === 1 ? uniqueSellers[0] : null;

    const [quotation] = await db
      .insert(quotations)
      .values({
        userId: auth.userId,
        customerId: auth.customerId,
        companyId: sellerCompanyId,
        licitacionCode: licitacionCode || null,
        userType,
        items,
        total: String(total),
        cotizanteName: cotizanteName || null,
        cotizanteEmail: cotizanteEmail || null,
        cotizantePhone: cotizantePhone || null,
        cotizanteInstitution: cotizanteInstitution || null,
        cotizantePosition: cotizantePosition || null,
        cotizanteRut: cotizanteRut || null,
      })
      .returning();

    const [withSeller] = await attachSeller([{ ...quotation }]);
    res.status(201).json(withSeller);
  } catch (error) {
    console.error("POST /quotes error:", error);
    res.status(500).json({ error: "Error al crear cotización" });
  }
});

/**
 * Detalle de una cotización. El acceso se acota con `quoteScope` (404 si no
 * pertenece al usuario, para no revelar cotizaciones ajenas).
 */
quotesRouter.put("/:id/status", requireAuth, requireEmpresa, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body;
    const VALID_STATUSES = ["pending", "approved", "rejected", "converted"];

    if (!status || !VALID_STATUSES.includes(status)) {
      res.status(400).json({ error: "Status inválido" });
      return;
    }

    const scope =
      req.auth!.role === "admin"
        ? eq(quotations.id, id)
        : and(eq(quotations.id, id), eq(quotations.companyId, req.auth!.companyId ?? -1));

    const [quotation] = await db.select().from(quotations).where(scope);
    if (!quotation) {
      res.status(404).json({ error: "Cotización no encontrada" });
      return;
    }

    const [updated] = await db
      .update(quotations)
      .set({ status, updatedAt: new Date() })
      .where(eq(quotations.id, id))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error("PUT /quotes/:id/status error:", error);
    res.status(500).json({ error: "Error al actualizar el estado de la cotización" });
  }
});

/**
 * Convierte una cotización en orden de compra. Sirve al comprador dueño de la
 * cotización, al vendedor de la empresa y al admin. Respeta los precios
 * congelados en la cotización, valida stock/crédito/estado del comprador y
 * descuenta inventario igual que un checkout normal.
 */
quotesRouter.post("/:id/convert", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const scope = quoteScope(id, req.auth!);
    if (!scope) {
      res.status(404).json({ error: "Cotización no encontrada" });
      return;
    }

    const [quotation] = await db.select().from(quotations).where(scope);
    if (!quotation) {
      res.status(404).json({ error: "Cotización no encontrada" });
      return;
    }

    if (quotation.status === "converted") {
      res.status(400).json({ error: "Esta cotización ya fue convertida en una orden de compra" });
      return;
    }
    if (quotation.status === "rejected") {
      res.status(400).json({ error: "No se puede convertir una cotización rechazada" });
      return;
    }
    if (quoteValidUntil(quotation.createdAt).getTime() < Date.now()) {
      res.status(400).json({ error: `La cotización expiró (validez de ${QUOTE_VALIDITY_DAYS} días)` });
      return;
    }

    const quoteItems = Array.isArray(quotation.items) ? quotation.items : [];
    const productIds = quoteItems
      .map((it) => Number(it.productId))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (!productIds.length) {
      res.status(400).json({ error: "La cotización no tiene productos válidos" });
      return;
    }

    const productRows = await db.select().from(products).where(inArray(products.id, productIds));
    const productsById = new Map(productRows.map((p) => [p.id, p]));

    const orderLines: Array<{
      productId: number;
      productName: string;
      productSku: string | null;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }> = [];
    let subtotal = 0;

    for (const it of quoteItems) {
      const productId = Number(it.productId);
      const product = productsById.get(productId);
      if (!product || product.status !== "active") {
        res.status(400).json({ error: `El producto "${it.name}" ya no está disponible` });
        return;
      }
      const qty = Math.max(1, Math.floor(Number(it.quantity)));
      if (product.stock < qty) {
        res.status(400).json({ error: `Stock insuficiente para "${product.name}" (disponible: ${product.stock})` });
        return;
      }
      // Precio congelado al momento de cotizar.
      const unitPrice = Math.round(Number(it.unitPrice));
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        res.status(400).json({ error: `La cotización no tiene precio válido para "${product.name}"` });
        return;
      }
      const totalPrice = unitPrice * qty;
      subtotal += totalPrice;
      orderLines.push({
        productId,
        productName: product.name,
        productSku: product.sku,
        quantity: qty,
        unitPrice,
        totalPrice,
      });
    }

    const tax = Math.round(subtotal * TAX_RATE);
    const total = subtotal + tax;

    const buyer = quotation.customerId
      ? (await db.select().from(customers).where(eq(customers.id, quotation.customerId)))[0] ?? null
      : null;

    if (buyer && buyer.status !== "active") {
      res.status(400).json({
        error: buyer.status === "suspended"
          ? "La cuenta del comprador está suspendida. No se puede generar la orden."
          : "La cuenta del comprador aún no ha sido aprobada. No se puede generar la orden.",
      });
      return;
    }

    if (buyer && Number(buyer.creditLimit) > 0) {
      const avail = Number(buyer.creditLimit) - (Number(buyer.creditUsed) || 0);
      if (total > avail) {
        res.status(400).json({
          error: `Línea de crédito insuficiente (disponible: $${new Intl.NumberFormat("es-CL").format(Math.round(avail))})`,
        });
        return;
      }
    }

    const channel = quotation.userType === "chilecompra" ? "chilecompra" : "retail";
    const orderNumber = generateOrderNumber();

    const order = await db.transaction(async (tx) => {
      const [orderRow] = await tx
        .insert(orders)
        .values({
          orderNumber,
          companyId: quotation.companyId,
          customerId: quotation.customerId,
          buyerName: buyer?.name ?? quotation.cotizanteName ?? null,
          buyerEmail: buyer?.email ?? quotation.cotizanteEmail ?? null,
          buyerRut: buyer?.rut ?? quotation.cotizanteRut ?? null,
          userId: quotation.userId,
          quotationId: quotation.id,
          status: "pending",
          channel,
          licitacionCode: quotation.licitacionCode,
          subtotal: String(subtotal),
          tax: String(tax),
          total: String(total),
          currency: "CLP",
          paymentMethod: buyer?.paymentTerms ?? null,
          creditUsed: buyer ? String(total) : "0",
        })
        .returning();

      await tx.insert(orderItems).values(
        orderLines.map((l) => ({
          orderId: orderRow.id,
          productId: l.productId,
          productName: l.productName,
          productSku: l.productSku,
          quantity: l.quantity,
          unitPrice: String(l.unitPrice),
          totalPrice: String(l.totalPrice),
        }))
      );

      for (const l of orderLines) {
        await tx
          .update(products)
          .set({ stock: sql`${products.stock} - ${l.quantity}` })
          .where(eq(products.id, l.productId));
      }

      if (buyer) {
        await tx
          .update(customers)
          .set({ creditUsed: String((Number(buyer.creditUsed) || 0) + total) })
          .where(eq(customers.id, buyer.id));
      }

      await tx
        .update(quotations)
        .set({ status: "converted", updatedAt: new Date() })
        .where(eq(quotations.id, quotation.id));

      return orderRow;
    });

    if (quotation.companyId) {
      await notifyCompanyUsers({
        companyId: quotation.companyId,
        title: "Nueva orden de compra recibida",
        message: `Se convirtió la cotización #${quotation.id} en la orden de compra ${order.orderNumber}.`,
        referenceId: order.id,
        referenceType: "order",
      });
    }
    if (quotation.customerId) {
      await notifyCustomerUsers({
        customerId: quotation.customerId,
        title: "Cotización convertida en orden de compra",
        message: `Tu cotización #${quotation.id} se convirtió en la orden ${order.orderNumber}.`,
        referenceId: order.id,
        referenceType: "order",
      });
    }

    res.status(201).json({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      channel: order.channel,
      subtotal: order.subtotal,
      tax: order.tax,
      total: order.total,
      createdAt: order.createdAt,
    });
  } catch (error) {
    console.error("POST /quotes/:id/convert error:", error);
    res.status(500).json({ error: "Error al convertir la cotización en pedido" });
  }
});

quotesRouter.get("/stats", requireAuth, requireEmpresa, async (req, res) => {
  try {
    const sellerScope = scopeCompanyId(req.auth);
    const customerScope = scopeCustomerId(req.auth);
    const byCustomer = customerScope === null ? undefined : eq(quotations.customerId, customerScope);

    const productFilter = sellerScope === null ? undefined : eq(products.companyId, sellerScope);

    const [productCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(products)
      .where(productFilter);

    const [activeProductCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(products)
      .where(productFilter ? and(productFilter, eq(products.status, "active")) : eq(products.status, "active"));

    const [quoteCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(quotations)
      .where(byCustomer);

    const [pendingCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(quotations)
      .where(byCustomer ? and(byCustomer, eq(quotations.status, "pending")) : eq(quotations.status, "pending"));

    const [totalRevenue] = await db
      .select({ sum: sql<string>`coalesce(sum(${quotations.total}), '0')` })
      .from(quotations)
      .where(byCustomer ? and(byCustomer, sql`${quotations.status} != 'rejected'`) : sql`${quotations.status} != 'rejected'`);

    const uniqueClients = await db
      .select({ userId: sql<number>`distinct ${quotations.userId}` })
      .from(quotations)
      .where(byCustomer ? and(byCustomer, sql`${quotations.userId} IS NOT NULL`) : sql`${quotations.userId} IS NOT NULL`);

    const recentQuotes = await db
      .select({
        id: quotations.id,
        cotizanteName: quotations.cotizanteName,
        cotizanteInstitution: quotations.cotizanteInstitution,
        total: quotations.total,
        status: quotations.status,
        userType: quotations.userType,
        licitacionCode: quotations.licitacionCode,
        createdAt: quotations.createdAt,
      })
      .from(quotations)
      .where(byCustomer)
      .orderBy(desc(quotations.createdAt))
      .limit(5);

    res.json({
      products: {
        total: Number(productCount.count),
        active: Number(activeProductCount.count),
      },
      quotations: {
        total: Number(quoteCount.count),
        pending: Number(pendingCount.count),
      },
      revenue: Number(totalRevenue.sum),
      clients: uniqueClients.length,
      recentQuotes,
    });
  } catch (error) {
    console.error("GET /quotes/stats error:", error);
    res.status(500).json({ error: "Error al obtener estadísticas" });
  }
});

quotesRouter.get("/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const scope = quoteScope(id, req.auth!);
    if (!scope) {
      res.status(404).json({ error: "Cotización no encontrada" });
      return;
    }

    const [quotation] = await db.select().from(quotations).where(scope);
    if (!quotation) {
      res.status(404).json({ error: "Cotización no encontrada" });
      return;
    }

    const [seller] = quotation.companyId
      ? await db.select({ name: companies.name }).from(companies).where(eq(companies.id, quotation.companyId))
      : [];

    const [withMeta] = await attachSeller([{ ...quotation }]);
    res.json({ ...withMeta, sellerName: seller?.name ?? withMeta.sellerName ?? null });
  } catch (error) {
    console.error("GET /quotes/:id error:", error);
    res.status(500).json({ error: "Error al obtener la cotización" });
  }
});

/**
 * Descarga la cotización en PDF: cabecera, datos del cotizante, tabla de
 * productos y desglose neto / IVA / total. El total guardado se trata como
 * neto, igual que el desglose de los pedidos.
 */
quotesRouter.get("/:id/pdf", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const scope = quoteScope(id, req.auth!);
    if (!scope) {
      res.status(404).json({ error: "Cotización no encontrada" });
      return;
    }

    const [quotation] = await db.select().from(quotations).where(scope);
    if (!quotation) {
      res.status(404).json({ error: "Cotización no encontrada" });
      return;
    }

    const [seller] = quotation.companyId
      ? await db.select().from(companies).where(eq(companies.id, quotation.companyId))
      : [];
    const [buyer] = quotation.customerId
      ? await db.select().from(customers).where(eq(customers.id, quotation.customerId))
      : [];
    const [author] = quotation.userId
      ? await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, quotation.userId))
      : [];

    const net = Number(quotation.total);
    const tax = Math.round(net * TAX_RATE);
    const total = net + tax;

    const doc = new PDFDocument({ size: "A4", margin: 50 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="COT-${String(quotation.id).padStart(6, "0")}.pdf"`
    );
    doc.pipe(res);

    doc.fontSize(18).fillColor("#0f172a").text("insightB2B");
    doc.fontSize(10).fillColor("#64748b").text("Cotización");
    doc.moveDown();

    doc.fontSize(14).fillColor("#0f172a").text(`Cotización N° ${String(quotation.id).padStart(6, "0")}`);
    doc.fontSize(10).fillColor("#475569");
    doc.text(`Fecha: ${formatDate(quotation.createdAt)}`);
    doc.text(`Estado: ${QUOTE_STATUS_LABELS[quotation.status] ?? quotation.status}`);
    doc.text(`Tipo: ${USER_TYPE_LABELS[quotation.userType] ?? quotation.userType}`);
    if (quotation.licitacionCode) doc.text(`Licitación: ${quotation.licitacionCode}`);
    if (seller) doc.text(`Vendedor: ${seller.name} · RUT ${seller.rut || "—"}`);
    const buyerLabel = buyer?.name ?? quotation.cotizanteInstitution ?? quotation.cotizanteName ?? author?.name ?? "Cliente";
    doc.text(`Cliente: ${buyerLabel}`);
    if (buyer?.rut || quotation.cotizanteRut) doc.text(`RUT: ${buyer?.rut ?? quotation.cotizanteRut}`);
    if (quotation.cotizanteEmail) doc.text(`Email: ${quotation.cotizanteEmail}`);
    if (quotation.cotizantePhone) doc.text(`Teléfono: ${quotation.cotizantePhone}`);
    doc.moveDown();

    const margin = 50;
    const colWidths = { sku: 90, name: 210, qty: 45, unit: 95, total: 100 };
    let y = doc.y;

    doc.font("Helvetica-Bold").fontSize(9).fillColor("#334155");
    doc.text("SKU", margin, y, { width: colWidths.sku });
    doc.text("Producto", margin + colWidths.sku, y, { width: colWidths.name });
    doc.text("Cant.", margin + colWidths.sku + colWidths.name, y, { width: colWidths.qty });
    doc.text("P. Unitario", margin + colWidths.sku + colWidths.name + colWidths.qty, y, { width: colWidths.unit });
    doc.text("Subtotal", margin + colWidths.sku + colWidths.name + colWidths.qty + colWidths.unit, y, { width: colWidths.total });

    y += 20;
    doc.font("Helvetica").fontSize(9).fillColor("#0f172a");
    for (const item of quotation.items) {
      doc.text(item.sku ?? "-", margin, y, { width: colWidths.sku, ellipsis: true });
      doc.text(item.name, margin + colWidths.sku, y, { width: colWidths.name, ellipsis: true });
      doc.text(String(item.quantity), margin + colWidths.sku + colWidths.name, y, { width: colWidths.qty });
      doc.text(formatCLP(Number(item.unitPrice)), margin + colWidths.sku + colWidths.name + colWidths.qty, y, { width: colWidths.unit });
      doc.text(
        formatCLP(Number(item.unitPrice) * Number(item.quantity)),
        margin + colWidths.sku + colWidths.name + colWidths.qty + colWidths.unit,
        y,
        { width: colWidths.total }
      );
      y += 18;
    }

    doc.y = y + 12;
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f172a");
    doc.text(`Neto: ${formatCLP(net)}`, { align: "right" });
    doc.font("Helvetica").text(`IVA (19%): ${formatCLP(tax)}`, { align: "right" });
    doc.font("Helvetica-Bold").text(`Total: ${formatCLP(total)}`, { align: "right" });

    doc.moveDown().moveDown();
    doc.font("Helvetica").fontSize(9).fillColor("#64748b");
    doc.text("Cotización válida por 15 días corridos desde su emisión.", { align: "center" });
    doc.text("Los precios están expresados en pesos chilenos.", { align: "center" });

    doc.end();
  } catch (error) {
    console.error("GET /quotes/:id/pdf error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Error generando el PDF" });
    }
  }
});

quotesRouter.get("/", requireAuth, async (req, res) => {
  try {
    const auth = req.auth!;
    const page = Math.max(1, Number(req.query.page) || 1);
    const perPage = Math.min(100, Math.max(1, Number(req.query.per_page) || 20));

    const conditions: SQL[] = [];
    if (auth.role === "cotizador") {
      // Comprador: solo sus cotizaciones (por cliente o, a falta de este, por usuario).
      if (auth.customerId) {
        conditions.push(eq(quotations.customerId, auth.customerId));
      } else {
        conditions.push(eq(quotations.userId, auth.userId));
      }
    } else {
      // Vendedor: solo las que corresponden a su empresa. `admin` ve todas.
      const companyScope = scopeCompanyId(auth);
      if (companyScope !== null) {
        conditions.push(eq(quotations.companyId, companyScope));
      }
    }

    const status = req.query.status as string | undefined;
    if (status) {
      conditions.push(eq(quotations.status, status));
    }

    const where = and(...conditions);

    const [countResult, rows] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(quotations)
        .where(where),
      db
        .select()
        .from(quotations)
        .where(where)
        .orderBy(desc(quotations.createdAt))
        .limit(perPage)
        .offset((page - 1) * perPage),
    ]);

    const total = Number(countResult[0]?.count || 0);
    const rowsWithSeller = await attachSeller(rows as Array<Record<string, unknown>>);

    res.json({
      data: rowsWithSeller,
      pagination: {
        page,
        per_page: perPage,
        total,
        total_pages: Math.ceil(total / perPage),
      },
    });
  } catch (error) {
    console.error("GET /quotes error:", error);
    res.status(500).json({ error: "Error al obtener cotizaciones" });
  }
});

