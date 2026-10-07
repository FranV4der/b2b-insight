import { Router } from "express";
import PDFDocument from "pdfkit";
import { db } from "../db/index.js";
import { orders, orderItems, products, priceListItems, customers, users } from "../db/schema.js";
import { eq, and, or, inArray, desc, sql, isNotNull, type SQL } from "drizzle-orm";
import { requireAuth, requireEmpresa, isAdminRequest, scopeCompanyId, scopeCustomerId } from "../middleware/auth.js";
import { resolvePriceContext } from "../services/pricing.js";
import { notifyCompanyUsers, notifyCustomerUsers } from "../services/notifications.js";

export const ordersRouter = Router();

const PAYMENT_METHODS = ["transferencia", "credito", "factura", "contraentrega"];
const TAX_RATE = 0.19;

function roundCLP(n: number): number {
  return Math.round(n);
}

function generateOrderNumber(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `OC-${ymd}-${rand}`;
}

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

function renderOrderPdf(
  doc: InstanceType<typeof PDFDocument>,
  order: typeof orders.$inferSelect,
  items: typeof orderItems.$inferSelect[],
  customerName: string | null
): void {
  const margin = 50;

  doc.fontSize(18).fillColor("#0f172a").text("insightB2B");
  doc.fontSize(10).fillColor("#64748b").text("Orden de compra / Cotización");
  doc.moveDown();

  doc.fontSize(14).fillColor("#0f172a").text(`Orden ${order.orderNumber}`);
  doc.fontSize(10).fillColor("#475569");
  doc.text(`Fecha: ${formatDate(order.createdAt)}`);
  doc.text(`Estado: ${ORDER_STATUS_LABELS[order.status] ?? order.status}`);
  doc.text(`Canal: ${order.channel === "chilecompra" ? "ChileCompra" : "Retail"}`);
  doc.text(`Cliente: ${customerName ?? order.buyerName ?? "Cliente"}`);
  if (order.licitacionCode) doc.text(`Licitación: ${order.licitacionCode}`);
  if (order.paymentMethod) doc.text(`Pago: ${order.paymentMethod}`);
  if (order.poNumber) doc.text(`OC / Referencia: ${order.poNumber}`);
  if (order.shippingAddress) doc.text(`Despacho: ${order.shippingAddress}`);
  if (order.shippingNotes) doc.text(`Notas de despacho: ${order.shippingNotes}`);
  if (order.notes) doc.text(`Comentarios: ${order.notes}`);
  doc.moveDown();

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
  for (const item of items) {
    doc.text(item.productSku ?? "-", margin, y, { width: colWidths.sku, ellipsis: true });
    doc.text(item.productName, margin + colWidths.sku, y, { width: colWidths.name, ellipsis: true });
    doc.text(String(item.quantity), margin + colWidths.sku + colWidths.name, y, { width: colWidths.qty });
    doc.text(formatCLP(Number(item.unitPrice)), margin + colWidths.sku + colWidths.name + colWidths.qty, y, { width: colWidths.unit });
    doc.text(formatCLP(Number(item.totalPrice)), margin + colWidths.sku + colWidths.name + colWidths.qty + colWidths.unit, y, { width: colWidths.total });
    y += 18;
  }

  doc.y = y + 12;
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f172a");
  doc.text(`Subtotal: ${formatCLP(Number(order.subtotal))}`, { align: "right" });
  doc.text(`IVA (19%): ${formatCLP(Number(order.tax))}`, { align: "right" });
  doc.text(`Total: ${formatCLP(Number(order.total))}`, { align: "right" });
}

ordersRouter.post("/", requireAuth, async (req, res) => {
  try {
    const auth = req.auth!;
    const {
      items,
      shippingAddress,
      shippingNotes,
      notes,
      poNumber,
      paymentMethod,
      channel,
      licitacionCode,
      customerId: actingCustomerId,
    } = req.body;

    // El admin de plataforma no tiene comprador propio: opera en nombre de uno.
    let buyerCustomerId: number | null;
    if (isAdminRequest(req)) {
      if (actingCustomerId === undefined || actingCustomerId === null) {
        res.status(400).json({
          error: "El administrador debe indicar customerId (comprador en cuyo nombre se crea el pedido)",
        });
        return;
      }
      buyerCustomerId = Number(actingCustomerId);
    } else {
      if (actingCustomerId !== undefined && Number(actingCustomerId) !== auth.customerId) {
        res.status(403).json({ error: "No puedes crear pedidos en nombre de otro comprador" });
        return;
      }
      // Sin `customer_id` el comprador no tiene perfil de cliente: no aplica precio
      // ni canal y solo puede operar sobre los pedidos que él mismo creó.
      buyerCustomerId = auth.customerId;
    }

    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "Se requiere al menos un producto en el pedido" });
      return;
    }

    if (paymentMethod && !PAYMENT_METHODS.includes(paymentMethod)) {
      res.status(400).json({ error: "Método de pago no válido" });
      return;
    }

    const ctx = await resolvePriceContext(buyerCustomerId ?? undefined, channel);
    if (!ctx.channel) {
      res.status(403).json({ error: "Tu cuenta no tiene una lista de precios asignada" });
      return;
    }
    if (ctx.status && ctx.status !== "active") {
      res.status(403).json({
        error: ctx.status === "suspended"
          ? "Tu cuenta está suspendida. Contacta al proveedor para regularizar tu cuenta."
          : "Tu empresa aún no ha sido aprobada. No puedes realizar compras hasta que un proveedor la active.",
      });
      return;
    }
    const orderChannel = ctx.channel;

    if (orderChannel === "chilecompra" && !licitacionCode?.trim()) {
      res.status(400).json({ error: "El código de licitación es obligatorio para compras de Mercado Público" });
      return;
    }

    const productIds = items.map((i: { productId: number }) => Number(i.productId));
    if (productIds.some((id: number) => !Number.isInteger(id))) {
      res.status(400).json({ error: "Los productos del pedido no son válidos" });
      return;
    }

    const productRows = await db
      .select()
      .from(products)
      .where(and(eq(products.status, "active"), inArray(products.id, productIds)));

    if (productRows.length !== productIds.length) {
      res.status(400).json({ error: "Uno o más productos no están disponibles" });
      return;
    }

    const productsById = new Map(productRows.map((p) => [p.id, p]));

    const priceListIds: number[] = [];
    if (orderChannel === "retail") {
      if (ctx.priceListId) priceListIds.push(ctx.priceListId);
    } else {
      priceListIds.push(...Array.from(ctx.mpPriceListsByProvider.values()));
    }

    let priceItems: typeof priceListItems.$inferSelect[] = [];
    if (priceListIds.length) {
      priceItems = await db
        .select()
        .from(priceListItems)
        .where(and(inArray(priceListItems.priceListId, priceListIds), inArray(priceListItems.productId, productIds)));
    }

    const priceByProduct = new Map<number, { price: string; discount: string }>();
    for (const p of priceItems) {
      if (!priceByProduct.has(p.productId)) {
        priceByProduct.set(p.productId, { price: p.price, discount: p.discount || "0" });
      }
    }

    const orderLines: Array<{
      productId: number;
      productName: string;
      productSku: string | null;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }> = [];
    let subtotal = 0;

    for (const it of items) {
      const productId = Number(it.productId);
      const product = productsById.get(productId)!;
      const qty = Math.max(1, Math.floor(Number(it.quantity)));

      if (product.minOrderQty > 1 && qty < product.minOrderQty) {
        res.status(400).json({ error: `La cantidad mínima de "${product.name}" es ${product.minOrderQty}` });
        return;
      }
      if (product.stock < qty) {
        res.status(400).json({ error: `Stock insuficiente para "${product.name}" (disponible: ${product.stock})` });
        return;
      }

      const pl = priceByProduct.get(productId);
      const rawPrice = pl ? Number(pl.price) : Number(product.regularPrice) || 0;
      const discount = pl ? Number(pl.discount) || 0 : 0;
      const unitPrice = roundCLP(rawPrice * (1 - discount / 100));
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

    const tax = roundCLP(subtotal * TAX_RATE);
    const total = subtotal + tax;
    const orderNumber = generateOrderNumber();

    // El vendedor del pedido es el dueño de los productos comprados.
    const sellerRows = await db
      .select({ companyId: products.companyId })
      .from(products)
      .where(and(inArray(products.id, productIds), isNotNull(products.companyId)));
    const sellerCompanyIds = [...new Set(
      sellerRows.map((r) => r.companyId).filter((c): c is number => c != null)
    )];
    const sellerCompanyId = sellerCompanyIds.length === 1 ? sellerCompanyIds[0] : null;

    const buyer = buyerCustomerId
      ? (await db.select().from(customers).where(eq(customers.id, buyerCustomerId)))[0] ?? null
      : null;
    const buyerUser = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, auth.userId));

    // Validación de crédito: si el comprador tiene línea de crédito activa,
    // el monto del pedido (total) no puede superar el saldo disponible.
    if (buyer && Number(buyer.creditLimit) > 0) {
      const used = Number(buyer.creditUsed) || 0;
      const avail = Number(buyer.creditLimit) - used;
      if (total > avail) {
        res.status(400).json({
          error: `Línea de crédito insuficiente (disponible: $${avail.toLocaleString("es-CL")})`,
        });
        return;
      }
    }

    const order = await db.transaction(async (tx) => {
      const [orderRow] = await tx
        .insert(orders)
        .values({
          orderNumber,
          companyId: sellerCompanyId,
          customerId: buyerCustomerId,
          buyerName: buyer?.name ?? buyerUser[0]?.name ?? null,
          buyerEmail: buyer?.email ?? buyerUser[0]?.email ?? null,
          buyerRut: buyer?.rut ?? null,
          userId: auth.userId,
          status: "pending",
          channel: orderChannel,
          licitacionCode: orderChannel === "chilecompra" ? licitacionCode.trim() : null,
          subtotal: String(subtotal),
          tax: String(tax),
          total: String(total),
          currency: "CLP",
          paymentMethod: paymentMethod || null,
          creditUsed: buyer ? String(total) : "0",
          shippingAddress: shippingAddress || null,
          shippingNotes: shippingNotes || null,
          notes: notes || null,
          poNumber: poNumber || null,
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

      return orderRow;
    });

    const buyerLabel = buyer?.name ?? buyerUser[0]?.name ?? "un cliente";

    for (const providerCompanyId of sellerCompanyIds) {
      await safeNotify({
        companyId: providerCompanyId,
        title: "Nueva orden de compra recibida",
        message: `Recibiste la orden de compra ${order.orderNumber} de ${buyerLabel}. Revísalo en el panel de administración.`,
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
    console.error("POST /orders error:", error);
    res.status(500).json({ error: "Error al crear el pedido" });
  }
});

ordersRouter.get("/", requireAuth, async (req, res) => {
  try {
    const auth = req.auth!;
    const customerScope = scopeCustomerId(auth);
    const page = Math.max(1, Number(req.query.page) || 1);
    const perPage = Math.min(100, Math.max(1, Number(req.query.per_page) || 20));

    // Solo el admin de plataforma ve todos los pedidos. Cualquier otro rol queda
    // acotado a su cliente; si no tiene `customer_id`, solo a los pedidos propios.
    const conditions: SQL[] =
      auth.role === "admin"
        ? []
        : [or(eq(orders.customerId, customerScope ?? -1), eq(orders.userId, auth.userId))!];

    const status = req.query.status as string | undefined;
    if (status) {
      conditions.push(eq(orders.status, status));
    }

    const where = and(...conditions);

    const [countResult, rows] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(orders).where(where),
      db
        .select()
        .from(orders)
        .where(where)
        .orderBy(desc(orders.createdAt))
        .limit(perPage)
        .offset((page - 1) * perPage),
    ]);

    const total = Number(countResult[0]?.count || 0);

    const orderIds = rows.map((r) => r.id);
    let itemCounts = new Map<number, number>();
    if (orderIds.length) {
      const itemRows = await db
        .select({ orderId: orderItems.orderId, count: sql<number>`count(*)` })
        .from(orderItems)
        .where(inArray(orderItems.orderId, orderIds))
        .groupBy(orderItems.orderId);
      itemCounts = new Map(itemRows.map((r) => [r.orderId, Number(r.count)]));
    }

    const data = rows.map((row) => ({
      ...row,
      itemCount: itemCounts.get(row.id) || 0,
    }));

    res.json({
      data,
      pagination: {
        page,
        per_page: perPage,
        total,
        total_pages: Math.ceil(total / perPage),
      },
    });
  } catch (error) {
    console.error("GET /orders error:", error);
    res.status(500).json({ error: "Error al obtener pedidos" });
  }
});

// ─── ADMIN (proveedor): órdenes de sus clientes ───────────

const ORDER_TRANSITIONS: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  shipped: "Enviada",
  delivered: "Entregada",
  cancelled: "Cancelada",
};

async function safeNotify(params: Parameters<typeof notifyCompanyUsers>[0]): Promise<void> {
  try {
    await notifyCompanyUsers(params);
  } catch (error) {
    console.error("notify error:", error);
  }
}

async function safeNotifyBuyer(params: Parameters<typeof notifyCustomerUsers>[0]): Promise<void> {
  try {
    await notifyCustomerUsers(params);
  } catch (error) {
    console.error("notify error:", error);
  }
}

/**
 * Pedidos que le interesan a la empresa proveedora (los que contienen sus productos).
 * El admin de plataforma (adminCompanyId === null) no se acota: ve todos.
 */
async function adminRelevantOrderIds(adminCompanyId: number | null): Promise<number[] | null> {
  if (adminCompanyId === null) return null;
  const rows = await db
    .select({ orderId: orderItems.orderId })
    .from(orderItems)
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(eq(products.companyId, adminCompanyId));
  return rows.map((r) => r.orderId);
}

async function adminCanAccess(adminCompanyId: number | null, orderId: number): Promise<boolean> {
  if (adminCompanyId === null) return true;
  const [match] = await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(and(eq(orderItems.orderId, orderId), eq(products.companyId, adminCompanyId)))
    .limit(1);
  return !!match;
}

ordersRouter.get("/admin", requireAuth, requireEmpresa, async (req, res) => {
  try {
    const adminCompanyId = scopeCompanyId(req.auth);
    const page = Math.max(1, Number(req.query.page) || 1);
    const perPage = Math.min(100, Math.max(1, Number(req.query.per_page) || 20));
    const status = req.query.status as string | undefined;

    const relevantOrderIds = await adminRelevantOrderIds(adminCompanyId);
    const conditions: SQL[] =
      relevantOrderIds === null
        ? []
        : relevantOrderIds.length
          ? [inArray(orders.id, relevantOrderIds)]
          : [sql`false`];
    if (status) {
      conditions.push(eq(orders.status, status));
    }
    const where = and(...conditions);

    const [countResult, rows] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(orders).where(where),
      db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          companyId: orders.companyId,
          customerId: orders.customerId,
          companyName: customers.name,
          status: orders.status,
          channel: orders.channel,
          licitacionCode: orders.licitacionCode,
          subtotal: orders.subtotal,
          tax: orders.tax,
          total: orders.total,
          paymentMethod: orders.paymentMethod,
          shippingAddress: orders.shippingAddress,
          poNumber: orders.poNumber,
          createdAt: orders.createdAt,
          updatedAt: orders.updatedAt,
        })
        .from(orders)
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .where(where)
        .orderBy(desc(orders.createdAt))
        .limit(perPage)
        .offset((page - 1) * perPage),
    ]);

    const total = Number(countResult[0]?.count || 0);

    const orderIds = rows.map((r) => r.id);
    let itemCounts = new Map<number, number>();
    if (orderIds.length) {
      const itemRows = await db
        .select({ orderId: orderItems.orderId, count: sql<number>`count(*)` })
        .from(orderItems)
        .where(inArray(orderItems.orderId, orderIds))
        .groupBy(orderItems.orderId);
      itemCounts = new Map(itemRows.map((r) => [r.orderId, Number(r.count)]));
    }

    const data = rows.map((row) => ({
      ...row,
      itemCount: itemCounts.get(row.id) || 0,
    }));

    res.json({
      data,
      pagination: {
        page,
        per_page: perPage,
        total,
        total_pages: Math.ceil(total / perPage),
      },
    });
  } catch (error) {
    console.error("GET /orders/admin error:", error);
    res.status(500).json({ error: "Error al obtener pedidos" });
  }
});

ordersRouter.get("/admin/:id", requireAuth, requireEmpresa, async (req, res) => {
  try {
    const adminCompanyId = scopeCompanyId(req.auth);
    const id = Number(req.params.id);

    if (!(await adminCanAccess(adminCompanyId, id))) {
      res.status(403).json({ error: "Este pedido no corresponde a tu empresa" });
      return;
    }

    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    if (!order) {
      res.status(404).json({ error: "Pedido no encontrado" });
      return;
    }

    const [customer] = order.customerId
      ? await db.select().from(customers).where(eq(customers.id, order.customerId))
      : [];
    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id))
      .orderBy(orderItems.id);

    res.json({ ...order, companyName: customer?.name ?? order.buyerName ?? null, items });
  } catch (error) {
    console.error("GET /orders/admin/:id error:", error);
    res.status(500).json({ error: "Error al obtener pedido" });
  }
});

ordersRouter.put("/:id/status", requireAuth, requireEmpresa, async (req, res) => {
  try {
    const adminCompanyId = req.auth!.companyId;
    const id = Number(req.params.id);
    const { status: newStatus } = req.body;

    const VALID = ["pending", "confirmed", "shipped", "delivered", "cancelled"];
    if (!VALID.includes(newStatus)) {
      res.status(400).json({ error: "Estado no válido" });
      return;
    }

    if (!(await adminCanAccess(adminCompanyId, id))) {
      res.status(403).json({ error: "Este pedido no corresponde a tu empresa" });
      return;
    }

    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    if (!order) {
      res.status(404).json({ error: "Pedido no encontrado" });
      return;
    }

    if (newStatus === order.status) {
      res.json(order);
      return;
    }

    if (!(ORDER_TRANSITIONS[order.status] ?? []).includes(newStatus)) {
      res.status(400).json({ error: `No se puede pasar de "${order.status}" a "${newStatus}"` });
      return;
    }

    const [updated] = await db
      .update(orders)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();

    await safeNotifyBuyer({
      customerId: order.customerId ?? 0,
      title: "Estado de orden de compra actualizado",
      message: `Tu orden de compra ${order.orderNumber} cambió a "${ORDER_STATUS_LABELS[newStatus] ?? newStatus}".`,
      referenceId: order.id,
      referenceType: "order",
    });

    res.json(updated);
  } catch (error) {
    console.error("PUT /orders/:id/status error:", error);
    res.status(500).json({ error: "Error al actualizar pedido" });
  }
});

ordersRouter.get("/:id", requireAuth, async (req, res) => {
  try {
    const auth = req.auth!;
    const customerScope = scopeCustomerId(auth);
    const id = Number(req.params.id);

    const [order] = await db
      .select()
      .from(orders)
      .where(
        auth.role === "admin"
          ? eq(orders.id, id)
          : and(
              eq(orders.id, id),
              or(eq(orders.customerId, customerScope ?? -1), eq(orders.userId, auth.userId))
            )
      );

    if (!order) {
      res.status(404).json({ error: "Pedido no encontrado" });
      return;
    }

    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id))
      .orderBy(orderItems.id);

    res.json({ ...order, items });
  } catch (error) {
    console.error("GET /orders/:id error:", error);
    res.status(500).json({ error: "Error al obtener pedido" });
  }
});

ordersRouter.get("/:id/pdf", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const auth = req.auth!;

    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    if (!order) {
      res.status(404).json({ error: "Pedido no encontrado" });
      return;
    }

    const isPlatformAdmin = auth.role === "admin";
    const isOwner = order.customerId === auth.customerId || order.userId === auth.userId;
    const isProvider = auth.role === "empresa" && (await adminCanAccess(auth.companyId, id));
    if (!isPlatformAdmin && !isOwner && !isProvider) {
      res.status(403).json({ error: "No tienes acceso a este pedido" });
      return;
    }

    const [customer] = order.customerId
      ? await db.select().from(customers).where(eq(customers.id, order.customerId))
      : [];
    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id))
      .orderBy(orderItems.id);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="OC-${order.orderNumber}.pdf"`);

    const doc = new PDFDocument({ size: "A4", margin: 50 });
    doc.pipe(res);
    renderOrderPdf(doc, order, items, customer?.name ?? order.buyerName ?? null);
    doc.end();
  } catch (error) {
    console.error("GET /orders/:id/pdf error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Error al generar el PDF" });
    }
  }
});

ordersRouter.post("/:id/cancel", requireAuth, async (req, res) => {
  try {
    const auth = req.auth!;
    const customerScope = scopeCustomerId(auth);
    const id = Number(req.params.id);

    const [order] = await db
      .select()
      .from(orders)
      .where(
        auth.role === "admin"
          ? eq(orders.id, id)
          : and(
              eq(orders.id, id),
              or(eq(orders.customerId, customerScope ?? -1), eq(orders.userId, auth.userId))
            )
      );

    if (!order) {
      res.status(404).json({ error: "Pedido no encontrado" });
      return;
    }

    if (order.status === "cancelled") {
      res.json(order);
      return;
    }

    if (order.status !== "pending" && order.status !== "confirmed") {
      res.status(400).json({ error: "Este pedido ya no puede cancelarse" });
      return;
    }

    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));

    const updated = await db.transaction(async (tx) => {
      for (const item of items) {
        if (item.productId != null) {
          await tx
            .update(products)
            .set({ stock: sql`${products.stock} + ${item.quantity}` })
            .where(eq(products.id, item.productId));
        }
      }

      if (Number(order.creditUsed) > 0 && order.customerId != null) {
        const [cust] = await tx
          .select({ creditUsed: customers.creditUsed })
          .from(customers)
          .where(eq(customers.id, order.customerId));
        if (cust) {
          const remaining = Math.max(0, (Number(cust.creditUsed) || 0) - Number(order.creditUsed));
          await tx.update(customers).set({ creditUsed: String(remaining) }).where(eq(customers.id, order.customerId));
        }
      }

      const [row] = await tx
        .update(orders)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(orders.id, order.id))
        .returning();
      return row;
    });

    await safeNotifyBuyer({
      customerId: order.customerId ?? 0,
      title: "Orden de compra cancelada",
      message: `Tu orden de compra ${order.orderNumber} fue cancelada.`,
      referenceId: order.id,
      referenceType: "order",
    });

    res.json(updated);
  } catch (error) {
    console.error("POST /orders/:id/cancel error:", error);
    res.status(500).json({ error: "Error al cancelar pedido" });
  }
});
