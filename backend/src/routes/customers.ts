import { Router } from "express";
import { db } from "../db/index.js";
import { customers, users, priceLists } from "../db/schema.js";
import { eq, and, or, ilike, asc, sql, inArray } from "drizzle-orm";
import { requireAuth, scopeCustomerId } from "../middleware/auth.js";
import { normalizeRut, EMAIL_RE } from "../utils/validation.js";
import {
  PAYMENT_TERMS,
  CUSTOMER_KINDS,
  CUSTOMER_TYPES,
  CUSTOMER_STATUSES,
  type CustomerKind,
  type CustomerType,
  type CustomerStatus,
} from "../db/schema.js";

export const customersRouter = Router();

customersRouter.use(requireAuth);

/**
 * Compradores. El admin de plataforma ve todos; el admin de cada vendedor ve solo
 * los clientes de su empresa; el comprador ve únicamente su propia ficha.
 */
customersRouter.get("/", async (req, res) => {
  try {
    const auth = req.auth!;
    const search = (req.query.search as string) || "";

    const conditions = [];
    if (auth.role === "cotizador") {
      conditions.push(eq(customers.id, scopeCustomerId(auth) ?? -1));
    } else if (auth.role === "empresa") {
      conditions.push(eq(customers.companyId, auth.companyId ?? -1));
    }
    if (search) {
      conditions.push(
        or(
          ilike(customers.name, `%${search}%`),
          ilike(customers.email, `%${search}%`),
          ilike(customers.rut, `%${search}%`)
        )
      );
    }
    const where = conditions.length ? and(...conditions) : undefined;

    const rows = await db.select().from(customers).where(where).orderBy(asc(customers.name));

    const customerIds = rows.map((r) => r.id);
    let userCounts = new Map<number, number>();
    if (customerIds.length) {
      const counts = await db
        .select({ customerId: users.customerId, count: sql<number>`count(*)` })
        .from(users)
        .where(inArray(users.customerId, customerIds))
        .groupBy(users.customerId);
      userCounts = new Map(
        counts
          .filter((c): c is { customerId: number; count: number } => c.customerId !== null)
          .map((c) => [c.customerId, Number(c.count)])
      );
    }

    res.json(rows.map((r) => ({ ...r, userCount: userCounts.get(r.id) || 0 })));
  } catch (error) {
    console.error("GET /customers error:", error);
    res.status(500).json({ error: "Error al obtener compradores" });
  }
});

const trimmedOrNull = (v: unknown) =>
  v === undefined ? undefined : v === null ? null : String(v).trim() || null;

/**
 * Valida la condición de pago. Devuelve `undefined` si el campo no llegó
 * (para no tocarlo en un PUT) o un mensaje de error si el valor no es válido.
 */
function validatePaymentTerms(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (value === null || String(value).trim() === "") return undefined;
  if (!PAYMENT_TERMS.includes(value as (typeof PAYMENT_TERMS)[number])) {
    return "Condición de pago no válida (contado, 30, 60 o 90 días)";
  }
  return undefined;
}

customersRouter.post("/", async (req, res) => {
  try {
    const auth = req.auth!;
    if (auth.role !== "admin" && auth.role !== "empresa") {
      res.status(403).json({ error: "No tienes permisos para crear clientes" });
      return;
    }
    // El admin de plataforma puede asignar el vendedor; el de empresa solo crea
    // clientes para la suya.
    const targetCompanyId =
      auth.role === "empresa"
        ? auth.companyId ?? -1
        : req.body.companyId != null
          ? Number(req.body.companyId)
          : null;

    const {
      kind,
      name,
      rut,
      email,
      phone,
      address,
      commune,
      region,
      type,
      priceListId,
      creditLimit,
      status,
      billingAddress,
      billingCommune,
      billingRegion,
      paymentTerms,
    } = req.body;

    if (!name?.trim()) {
      res.status(400).json({ error: "El nombre del comprador es requerido" });
      return;
    }
    if (kind !== undefined && !CUSTOMER_KINDS.includes(kind as CustomerKind)) {
      res.status(400).json({ error: "Tipo de comprador no válido (persona | empresa)" });
      return;
    }
    if (type !== undefined && !CUSTOMER_TYPES.includes(type as CustomerType)) {
      res.status(400).json({ error: "Canal de compra no válido" });
      return;
    }
    if (status !== undefined && !CUSTOMER_STATUSES.includes(status as CustomerStatus)) {
      res.status(400).json({ error: "Estado de comprador no válido" });
      return;
    }
    const paymentTermsError = validatePaymentTerms(paymentTerms);
    if (paymentTermsError) {
      res.status(400).json({ error: paymentTermsError });
      return;
    }

    let resolvedRut: string | null = null;
    if (rut !== undefined && rut !== null && String(rut).trim() !== "") {
      const normalized = normalizeRut(String(rut));
      if (!normalized) {
        res.status(400).json({ error: "El RUT no es válido" });
        return;
      }
      const [dup] = await db.select({ id: customers.id }).from(customers).where(eq(customers.rut, normalized));
      if (dup) {
        res.status(409).json({ error: "Ya existe un comprador con ese RUT" });
        return;
      }
      resolvedRut = normalized;
    }

    if (email !== undefined && email !== null && String(email).trim() !== "" && !EMAIL_RE.test(String(email))) {
      res.status(400).json({ error: "El email no tiene un formato válido" });
      return;
    }

    let resolvedPriceList: number | null = null;
    if (priceListId !== undefined && priceListId !== null) {
      const listId = Number(priceListId);
      if (Number.isNaN(listId)) {
        res.status(400).json({ error: "priceListId inválido" });
        return;
      }
      const [list] = await db.select({ id: priceLists.id }).from(priceLists).where(eq(priceLists.id, listId));
      if (!list) {
        res.status(400).json({ error: "La lista de precio no existe" });
        return;
      }
      resolvedPriceList = list.id;
    }

    let credit: string = "0";
    if (creditLimit !== undefined && creditLimit !== null && String(creditLimit).trim() !== "") {
      const parsed = Number(creditLimit);
      if (Number.isNaN(parsed) || parsed < 0) {
        res.status(400).json({ error: "El límite de crédito no es válido" });
        return;
      }
      credit = String(parsed);
    }

    const [created] = await db
      .insert(customers)
      .values({
        companyId: Number.isInteger(targetCompanyId) ? targetCompanyId : null,
        kind: kind ?? "empresa",
        name: name.trim(),
        rut: resolvedRut,
        email: email?.trim().toLowerCase() || null,
        phone: phone?.trim() || null,
        address: address?.trim() || null,
        commune: commune?.trim() || null,
        region: region?.trim() || null,
        type: type ?? "normal",
        priceListId: resolvedPriceList,
        creditLimit: credit,
        status: status ?? "pending",
        billingAddress: trimmedOrNull(billingAddress),
        billingCommune: trimmedOrNull(billingCommune),
        billingRegion: trimmedOrNull(billingRegion),
        paymentTerms: trimmedOrNull(paymentTerms),
      })
      .returning();

    res.status(201).json(created);
  } catch (error) {
    console.error("POST /customers error:", error);
    res.status(500).json({ error: "Error al crear comprador" });
  }
});

customersRouter.put("/:id", async (req, res) => {
  try {
    const auth = req.auth!;
    const id = Number(req.params.id);
    const scopedCustomerId = scopeCustomerId(auth);

    // El admin de empresa solo edita clientes de su vendedor; el comprador solo su
    // propia ficha. Se responde 404 para no revelar la existencia de ajenos.
    if (auth.role === "cotizador" && scopedCustomerId !== id) {
      res.status(404).json({ error: "Comprador no encontrado" });
      return;
    }
    if (auth.role === "empresa") {
      const [owned] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.id, id), eq(customers.companyId, auth.companyId ?? -1)));
      if (!owned) {
        res.status(404).json({ error: "Comprador no encontrado" });
        return;
      }
    }

    const [current] = await db.select().from(customers).where(eq(customers.id, id));
    if (!current) {
      res.status(404).json({ error: "Comprador no encontrado" });
      return;
    }

    const {
      kind,
      name,
      rut,
      email,
      phone,
      address,
      commune,
      region,
      type,
      priceListId,
      creditLimit,
      status,
      billingAddress,
      billingCommune,
      billingRegion,
      paymentTerms,
    } = req.body;

    if (kind !== undefined && !CUSTOMER_KINDS.includes(kind as CustomerKind)) {
      res.status(400).json({ error: "Tipo de comprador no válido (persona | empresa)" });
      return;
    }
    if (type !== undefined && !CUSTOMER_TYPES.includes(type as CustomerType)) {
      res.status(400).json({ error: "Canal de compra no válido" });
      return;
    }
    if (status !== undefined && !CUSTOMER_STATUSES.includes(status as CustomerStatus)) {
      res.status(400).json({ error: "Estado de comprador no válido" });
      return;
    }
    const paymentTermsError = validatePaymentTerms(paymentTerms);
    if (paymentTermsError) {
      res.status(400).json({ error: paymentTermsError });
      return;
    }
    if (name !== undefined && !name?.trim()) {
      res.status(400).json({ error: "El nombre no puede quedar vacío" });
      return;
    }

    let resolvedRut: string | null | undefined;
    if (rut !== undefined) {
      if (rut === null || String(rut).trim() === "") {
        resolvedRut = null;
      } else {
        const normalized = normalizeRut(String(rut));
        if (!normalized) {
          res.status(400).json({ error: "El RUT no es válido" });
          return;
        }
        const [dup] = await db
          .select({ id: customers.id })
          .from(customers)
          .where(and(eq(customers.rut, normalized), sql`${customers.id} <> ${id}`));
        if (dup) {
          res.status(409).json({ error: "Ya existe un comprador con ese RUT" });
          return;
        }
        resolvedRut = normalized;
      }
    }

    if (email !== undefined && email !== null && String(email).trim() !== "" && !EMAIL_RE.test(String(email))) {
      res.status(400).json({ error: "El email no tiene un formato válido" });
      return;
    }

    let resolvedPriceList: number | null | undefined;
    if (priceListId !== undefined) {
      if (priceListId === null) {
        resolvedPriceList = null;
      } else {
        const listId = Number(priceListId);
        if (Number.isNaN(listId)) {
          res.status(400).json({ error: "priceListId inválido" });
          return;
        }
        const [list] = await db.select({ id: priceLists.id }).from(priceLists).where(eq(priceLists.id, listId));
        if (!list) {
          res.status(400).json({ error: "La lista de precio no existe" });
          return;
        }
        resolvedPriceList = list.id;
      }
    }

    let resolvedCredit: string | undefined;
    if (creditLimit !== undefined) {
      if (creditLimit === null || String(creditLimit).trim() === "") {
        resolvedCredit = "0";
      } else {
        const parsed = Number(creditLimit);
        if (Number.isNaN(parsed) || parsed < 0) {
          res.status(400).json({ error: "El límite de crédito no es válido" });
          return;
        }
        resolvedCredit = String(parsed);
      }
    }

    const trimmed = (v: unknown) =>
      v === undefined ? undefined : v === null ? null : String(v).trim() || null;

    const [updated] = await db
      .update(customers)
      .set({
        ...(kind !== undefined && { kind }),
        ...(name !== undefined && { name: name.trim() }),
        ...(resolvedRut !== undefined && { rut: resolvedRut }),
        ...(email !== undefined && { email: trimmed(email)?.toLowerCase() ?? null }),
        ...(phone !== undefined && { phone: trimmed(phone) }),
        ...(address !== undefined && { address: trimmed(address) }),
        ...(commune !== undefined && { commune: trimmed(commune) }),
        ...(region !== undefined && { region: trimmed(region) }),
        ...(type !== undefined && { type }),
        ...(resolvedPriceList !== undefined && { priceListId: resolvedPriceList }),
        ...(resolvedCredit !== undefined && { creditLimit: resolvedCredit }),
        ...(status !== undefined && { status }),
        ...(billingAddress !== undefined && { billingAddress: trimmedOrNull(billingAddress) }),
        ...(billingCommune !== undefined && { billingCommune: trimmedOrNull(billingCommune) }),
        ...(billingRegion !== undefined && { billingRegion: trimmedOrNull(billingRegion) }),
        ...(paymentTerms !== undefined && { paymentTerms: trimmedOrNull(paymentTerms) }),
        updatedAt: new Date(),
      })
      .where(eq(customers.id, id))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error("PUT /customers/:id error:", error);
    res.status(500).json({ error: "Error al actualizar comprador" });
  }
});
