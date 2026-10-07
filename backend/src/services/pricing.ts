import { db } from "../db/index.js";
import { customers, priceLists } from "../db/schema.js";
import { eq } from "drizzle-orm";

export type BuyChannel = "retail" | "chilecompra";

export interface PriceContext {
  channel: BuyChannel | null;
  priceListId: number | null;
  mpPriceListsByProvider: Map<number, number>;
  status: string | null;
}

/**
 * Resuelve el contexto de precios según el comprador autenticado:
 * - Sin autenticación: precios ocultos (como prisa.cl).
 * - Comprador "normal": su lista de precios asignada (customers.priceListId).
 * - Comprador "chilecompra": la lista única de Mercado Público del proveedor
 *   (priceLists.isMpPriceList = true), referenciada por el proveedor que
 *   posee cada producto.
 * - Comprador "both": usa el canal indicado en la request (retail | chilecompra).
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

  const mpLists = await db
    .select()
    .from(priceLists)
    .where(eq(priceLists.isMpPriceList, true));

  const mpPriceListsByProvider = new Map<number, number>();
  for (const list of mpLists) {
    if (list.companyId != null) {
      mpPriceListsByProvider.set(list.companyId, list.id);
    }
  }

  return {
    channel,
    priceListId: channel === "retail" ? buyer.priceListId : null,
    mpPriceListsByProvider,
    status: buyer.status,
  };
}
