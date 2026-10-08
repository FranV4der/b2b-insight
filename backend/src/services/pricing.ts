import { db } from "../db/index.js";
import { customers, priceLists, customerPriceLists } from "../db/schema.js";
import { eq, and } from "drizzle-orm";

export type BuyChannel = "retail" | "chilecompra";

export interface PriceContext {
  channel: BuyChannel | null;
  /** Lista de precio asignada al comprador para el canal activo (o null). */
  priceListId: number | null;
  /** Lista ChileCompra del vendedor por proveedor (fallback cuando el comprador
   *  no tiene una lista asignada para el canal chilecompra). */
  mpPriceListsByProvider: Map<number, number>;
  status: string | null;
}

/**
 * Asignaciones de listas de precio de un comprador, por canal.
 * La unicidad "una lista por canal por comprador" se valida al guardar.
 */
export async function getCustomerPriceLists(customerId: number): Promise<
  Partial<Record<BuyChannel, number>>
> {
  const rows = await db
    .select({ channel: priceLists.channel, id: priceLists.id })
    .from(customerPriceLists)
    .innerJoin(priceLists, eq(customerPriceLists.priceListId, priceLists.id))
    .where(
      and(
        eq(customerPriceLists.customerId, customerId),
        eq(priceLists.isActive, true)
      )
    );

  const result: Partial<Record<BuyChannel, number>> = {};
  for (const row of rows) {
    if (row.channel === "retail" || row.channel === "chilecompra") {
      result[row.channel] = row.id;
    }
  }
  return result;
}

/**
 * Resuelve el contexto de precios según el comprador autenticado:
 * - Sin autenticación: precios ocultos (como prisa.cl).
 * - Comprador "normal": su lista de precio asignada para retail
 *   (customer_price_lists con channel = retail).
 * - Comprador "chilecompra": su lista asignada para chilecompra; si no existe,
 *   la lista única de Mercado Público del proveedor (price_lists con
 *   channel = chilecompra), referenciada por el proveedor que posee cada
 *   producto.
 * - Comprador "both": usa el canal indicado en la request (retail | chilecompra)
 *   y su lista asignada para ese canal.
 */
export async function resolvePriceContext(
  customerId?: number,
  requestedChannel?: string
): Promise<PriceContext> {
  const empty: PriceContext = {
    channel: null,
    priceListId: null,
    mpPriceListsByProvider: new Map(),
    status: null,
  };

  if (!customerId) return empty;

  const [buyer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId));
  if (!buyer) return empty;

  let channel: BuyChannel;
  if (buyer.type === "chilecompra") {
    channel = "chilecompra";
  } else if (buyer.type === "both") {
    channel = requestedChannel === "chilecompra" ? "chilecompra" : "retail";
  } else {
    channel = "retail";
  }

  const assignments = await getCustomerPriceLists(customerId);
  const priceListId = assignments[channel] ?? null;

  // Fallback para chilecompra: la lista MP del vendedor que posee cada producto.
  // Solo se consulta cuando el comprador no tiene una lista asignada para el canal.
  const mpPriceListsByProvider = new Map<number, number>();
  if (channel === "chilecompra" && priceListId == null) {
    const mpLists = await db
      .select()
      .from(priceLists)
      .where(eq(priceLists.channel, "chilecompra"));
    for (const list of mpLists) {
      if (list.companyId != null) {
        mpPriceListsByProvider.set(list.companyId, list.id);
      }
    }
  }

  return {
    channel,
    priceListId,
    mpPriceListsByProvider,
    status: buyer.status,
  };
}