import { Router } from "express";
import { db } from "../db/index.js";
import { customers, users, priceLists, customerPriceLists } from "../db/schema.js";
import { eq, and, or, ilike, asc, sql, inArray, isNull } from "drizzle-orm";
import { requireAuth, scopeCustomerId, scopeCompanyId, type AuthPayload } from "../middleware/auth.js";
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
 * Valida que un arreglo de ids de listas de precio sea válido y que las listas
 * pertenezcan al vendedor autenticado (tenancy). Devuelve un mapa canal → id de
 * lista, garantizando a lo sumo una lista por canal (retail / chilecompra).
 */
async function resolvePriceListAssignments(bodyPriceLists: unknown, auth: AuthPayload): Promise<Map<string, number>> {
  const assignments = new Map<string, number>();
  if (bodyPriceLists === undefined || bodyPriceLists === null) return assignments;
  if (!Array.isArray(bodyPriceLists)) {
    throw Object.assign(new Error("Listas de precio inválidas"), { status: 400 });
  }
  const ids = bodyPriceLists.map((p) => Number(p));
  if (ids.some((id) => !Number.isInteger(id))) {
    throw Object.assign(new Error("Listas de precio inválidas"), { status: 400 });
  }
  if (ids.length) {
    const scope = scopeCompanyId(auth);
    const rows = await db
      .select()
      .from(priceLists)
      .where(scope === null ? inArray(priceLists.id, ids) : and(inArray(priceLists.id, ids), eq(priceLists.companyId, scope)));
    const found = new Map(rows.map((r) => [r.id, r]));
    for (const id of ids) {
      const list = found.get(id);
      if (!list) {
        throw Object.assign(new Error("Una o más listas de precio no existen o no pertenecen a tu empresa"), { status: 400 });
      }
      if (assignments.has(list.channel)) {
        throw Object.assign(new Error(`Solo puede haber una lista de precio por canal (${list.channel})`), { status: 400 });
      }
      assignments.set(list.channel, list.id);
    }
  }
  return assignments;
}

/** Asignaciones de listas de precio (id + nombre + canal) de un comprador. */
async function getAssignmentsForCustomers(customerIds: number[]): Promise<Map<number, Array<{ id: number; name: string; channel: string }>>> {
  if (!customerIds.length) return new Map();
  const rows = await db
    .select({
      customerId: customerPriceLists.customerId,
      priceListId: customerPriceLists.priceListId,
      name: priceLists.name,
      channel: priceLists.channel,
    })
    .from(customerPriceLists)
    .innerJoin(priceLists, eq(customerPriceLists.priceListId, priceLists.id))
    .where(inArray(customerPriceLists.customerId, customerIds));
  const map = new Map<number, Array<{ id: number; name: string; channel: string }>>();
  for (const row of rows) {
    const list = { id: row.priceListId, name: row.name, channel: row.channel };
    map.set(row.customerId, [...(map.get(row.customerId) ?? []), list]);
  }
  return map;
}

async function setAssignments(customerId: number, assignments: Map<string, number>): Promise<void> {
  await db.delete(customerPriceLists).where(eq(customerPriceLists.customerId, customerId));
  if (assignments.size) {
    await db.insert(customerPriceLists).values(
      Array.from(assignments.entries()).map(([, priceListId]) => ({
        customerId,
        priceListId,
      }))
    );
  }
}

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
      // El vendedor ve sus clientes ya asignados y también los auto-registrados
      // aún sin asignar (company_id NULL), para poder reclamarlos.
      conditions.push(or(eq(customers.companyId, auth.companyId ?? -1), isNull(customers.companyId)));
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

    const assignments = await getAssignmentsForCustomers(customerIds);

    res.json(rows.map((r) => ({ ...r, userCount: userCounts.get(r.id) || 0, priceLists: assignments.get(r.id) ?? [] })));
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
    // El alta directa de compradores queda solo para el admin de plataforma. El
    // rol `empresa` no crea clientes: el comprador se registra solo (auth/register)
    // y el vendedor lo reclama vía PUT asignándole condiciones comerciales.
    if (auth.role !== "admin") {
      res.status(403).json({ error: "No tienes permisos para crear clientes" });
      return;
    }
    const targetCompanyId =
      req.body.companyId != null ? Number(req.body.companyId) : null;

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
      priceListIds,
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

    let assignments = new Map<string, number>();
    try {
      assignments = await resolvePriceListAssignments(priceListIds, auth);
    } catch (error) {
      const e = error as { message: string; status?: number };
      res.status(e.status ?? 400).json({ error: e.message });
      return;
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
        creditLimit: credit,
        status: status ?? "pending",
        billingAddress: trimmedOrNull(billingAddress),
        billingCommune: trimmedOrNull(billingCommune),
        billingRegion: trimmedOrNull(billingRegion),
        paymentTerms: trimmedOrNull(paymentTerms),
      })
      .returning();

    if (assignments.size) {
      await setAssignments(created.id, assignments);
    }
    const createdAssignments = await getAssignmentsForCustomers([created.id]);

    res.status(201).json({ ...created, userCount: 0, priceLists: createdAssignments.get(created.id) ?? [] });
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
        .where(and(eq(customers.id, id), or(eq(customers.companyId, auth.companyId ?? -1), isNull(customers.companyId))));
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
      priceListIds,
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

    let assignments: Map<string, number> | undefined;
    if (priceListIds !== undefined) {
      try {
        assignments = await resolvePriceListAssignments(priceListIds, auth);
      } catch (error) {
        const e = error as { message: string; status?: number };
        res.status(e.status ?? 400).json({ error: e.message });
        return;
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
        ...(resolvedCredit !== undefined && { creditLimit: resolvedCredit }),
        ...(status !== undefined && { status }),
        ...(billingAddress !== undefined && { billingAddress: trimmedOrNull(billingAddress) }),
        ...(billingCommune !== undefined && { billingCommune: trimmedOrNull(billingCommune) }),
        ...(billingRegion !== undefined && { billingRegion: trimmedOrNull(billingRegion) }),
        ...(paymentTerms !== undefined && { paymentTerms: trimmedOrNull(paymentTerms) }),
        ...(auth.role === "empresa" && auth.companyId != null && { companyId: auth.companyId }),
        updatedAt: new Date(),
      })
      .where(eq(customers.id, id))
      .returning();

    if (assignments) {
      await setAssignments(id, assignments);
    }
    const updatedAssignments = await getAssignmentsForCustomers([id]);

    res.json({ ...updated, priceLists: updatedAssignments.get(id) ?? [] });
  } catch (error) {
    console.error("PUT /customers/:id error:", error);
    res.status(500).json({ error: "Error al actualizar comprador" });
  }
});
