import "dotenv/config";
import pg from "pg";

/**
 * Migración del modelo "la lista de precios es la fuente de verdad":
 *
 *  1. Añade la columna `pending_sku` a `price_list_items` (SKU sin producto).
 *  2. Hace nullable `price_list_items.product_id` (permite filas pendientes).
 *  3. Índice parcial único por (price_list_id, lower(pending_sku)) para filas
 *     pendientes, de modo que un SKU no se repita dentro de la misma lista.
 *  4. Backfill: rellena `pending_sku` con `products.sku` en las filas ya
 *     enlazadas (para que un futuro match por SKU sea directo). No estorba.
 *
 * Orden de despliegue: ejecutar ESTE script ANTES de `npm run db:push` la
 * primera vez (db:push sincroniza el schema). El script es idempotente.
 */
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function columnExists(table: string, column: string): Promise<boolean> {
  const { rows } = await pool.query(
    "select 1 from information_schema.columns where table_name = $1 and column_name = $2",
    [table, column]
  );
  return rows.length > 0;
}

async function columnIsNullable(table: string, column: string): Promise<boolean> {
  const { rows } = await pool.query(
    "select is_nullable from information_schema.columns where table_name = $1 and column_name = $2",
    [table, column]
  );
  return rows[0]?.is_nullable === "YES";
}

async function main() {
  // 1) Columna pending_sku
  if (!(await columnExists("price_list_items", "pending_sku"))) {
    await pool.query("alter table price_list_items add column pending_sku varchar(100)");
    console.log("+ price_list_items.pending_sku");
  }

  // 2) product_id nullable (drop NOT NULL si aún lo tiene)
  if (!(await columnIsNullable("price_list_items", "product_id"))) {
    await pool.query("alter table price_list_items alter column product_id drop not null");
    console.log("→ price_list_items.product_id ahora nullable");
  }

  // 3) Backfill pending_sku desde el producto enlazado (si falta)
  const { rowCount } = await pool.query(`
    update price_list_items pli
    set pending_sku = p.sku
    from products p
    where pli.product_id = p.id
      and pli.pending_sku is null
  `);
  if ((rowCount ?? 0) > 0) {
    console.log(`→ pending_sku rellenado en ${rowCount} item(s)`);
  }

  // 4) Índice parcial único para filas pendientes
  await pool.query(`
    create unique index if not exists uq_price_list_items_list_pending_sku
    on price_list_items(price_list_id, lower(pending_sku))
    where product_id is null and pending_sku is not null
  `);
  console.log("+ índice único price_list_items(price_list_id, lower(pending_sku)) [pendientes]");

  // 5) Índice de búsqueda de pendientes (por SKU) para el enganche automático
  await pool.query(`
    create index if not exists idx_price_list_items_pending_sku
    on price_list_items(lower(pending_sku))
    where product_id is null
  `);
  console.log("+ índice idx_price_list_items_pending_sku");
}

main()
  .then(async () => {
    console.log("Migración completada ✓");
    await pool.end();
  })
  .catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exit(1);
  });
