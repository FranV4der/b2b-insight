import "dotenv/config";
import pg from "pg";

/**
 * Migración del modelo de listas de precio:
 *
 *  1. Añade la columna `channel` a `price_lists` (default 'retail').
 *  2. Backfill: las listas con `is_mp_price_list = true` pasan a
 *     channel = 'chilecompra'.
 *  3. Crea la tabla `customer_price_lists` (asignación comprador → lista).
 *  4. Backfill: migra `customers.price_list_id` a `customer_price_lists`.
 *  5. Dedupe de `price_list_items` (mismo producto repetido en una lista) para
 *     permitir el índice único (price_list_id, product_id).
 *
 * Orden de despliegue: ejecutar ESTE script ANTES de `npm run db:push` (que
 * sincroniza el schema y elimina las columnas `is_mp_price_list` y
 * `customers.price_list_id`). El script es idempotente.
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

async function main() {
  // 1) Columna channel en price_lists
  if (!(await columnExists("price_lists", "channel"))) {
    await pool.query("alter table price_lists add column channel varchar(20) not null default 'retail'");
    console.log("+ price_lists.channel");
  }

  // 2) Backfill is_mp_price_list → channel (mantener el default para el resto)
  if (await columnExists("price_lists", "is_mp_price_list")) {
    const { rowCount } = await pool.query(
      "update price_lists set channel = 'chilecompra' where is_mp_price_list = true and channel = 'retail'"
    );
    console.log(`→ channel='chilecompra' en ${rowCount} lista(s) MP`);
  }

  // 3) Tabla customer_price_lists
  await pool.query(`
    create table if not exists customer_price_lists (
      id serial primary key,
      customer_id integer not null references customers(id) on delete cascade,
      price_list_id integer not null references price_lists(id) on delete cascade,
      created_at timestamp default now() not null
    )
  `);
  await pool.query(
    "create index if not exists idx_customer_price_lists_customer on customer_price_lists(customer_id)"
  );
  await pool.query(
    "create index if not exists idx_customer_price_lists_list on customer_price_lists(price_list_id)"
  );
  console.log("+ customer_price_lists");

  // 4) Backfill customers.price_list_id → customer_price_lists
  if (await columnExists("customers", "price_list_id")) {
    const { rowCount } = await pool.query(`
      insert into customer_price_lists (customer_id, price_list_id)
      select id, price_list_id from customers
      where price_list_id is not null
      on conflict do nothing
    `);
    console.log(`→ ${rowCount} asignación(es) migradas desde customers.price_list_id`);
  }

  // 5) Dedupe price_list_items (conservar el primer item de cada producto)
  const { rowCount } = await pool.query(`
    delete from price_list_items a
    using price_list_items b
    where a.price_list_id = b.price_list_id
      and a.product_id = b.product_id
      and a.id > b.id
  `);
  const removed = rowCount ?? 0;
  if (removed > 0) console.log(`→ ${removed} item(s) duplicado(s) eliminados`);
  await pool.query(`
    create unique index if not exists uq_price_list_items_list_product
    on price_list_items(price_list_id, product_id)
  `);
  console.log("+ índice único price_list_items(price_list_id, product_id)");
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