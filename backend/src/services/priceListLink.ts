import { db } from "../db/index.js";
import { priceListItems } from "../db/schema.js";
import { and, isNull, sql } from "drizzle-orm";

/**
 * Enlaza las filas pendientes de listas de precio (product_id = null) cuyo
 * `pending_sku` coincide con el SKU dado. Match case-insensitive.
 * Devuelve cuántas filas se engancharon.
 */
export async function linkPendingPriceItems(productId: number, sku: string): Promise<number> {
  const { rowCount } = await db
    .update(priceListItems)
    .set({ productId })
    .where(and(
      isNull(priceListItems.productId),
      sql`lower(${priceListItems.pendingSku}) = lower(${sku})`,
    ));
  return rowCount ?? 0;
}
