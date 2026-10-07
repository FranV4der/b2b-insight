import "dotenv/config";
import bcrypt from "bcrypt";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seed() {
  const { rows: providers } = await pool.query(
    "select id, name from companies where slug = $1",
    ["insumos-arcadia"]
  );
  if (!providers.length) {
    throw new Error("Proveedor 'insumos-arcadia' no encontrado. Revisa la base de datos.");
  }
  const provider = providers[0];

  const { rows: providerProducts } = await pool.query(
    "select id, regular_price, price_chilecompra from products where company_id = $1",
    [provider.id]
  );
  if (!providerProducts.length) {
    throw new Error(`El proveedor "${provider.name}" no tiene productos.`);
  }

  const { rows: mpLists } = await pool.query(
    "select id from price_lists where is_mp_price_list = true and company_id = $1",
    [provider.id]
  );
  let mpListId: number;
  if (mpLists.length) {
    mpListId = mpLists[0].id;
  } else {
    const { rows: created } = await pool.query(
      "insert into price_lists (name, company_id, is_active, is_mp_price_list) values ($1, $2, true, true) returning id",
      ["Lista ChileCompra", provider.id]
    );
    mpListId = created[0].id;
    console.log(`Lista ChileCompra creada (id=${mpListId})`);
  }
  await insertItemsIfEmpty(mpListId, providerProducts.map((p) => ({ id: p.id, price: p.price_chilecompra ?? p.regular_price })));

  const users = [
    { n: 1, type: "normal", isMp: false },
    { n: 2, type: "normal", isMp: false },
    { n: 3, type: "normal", isMp: false },
    { n: 4, type: "both", isMp: true },
    { n: 5, type: "both", isMp: true },
  ];

  for (const cfg of users) {
    const email = `usuario${cfg.n}@test.cl`;
    const slug = `cliente-demo-${cfg.n}`;
    const name = `Usuario ${cfg.n}`;
    const listName = `Lista Usuario ${cfg.n}`;

    const { rows: existing } = await pool.query("select id from users where email = $1", [email]);
    if (existing.length) {
      console.log(`SKIP ${email} (ya existe)`);
      continue;
    }

    const { rows: existingCompanies } = await pool.query("select id from companies where slug = $1", [slug]);
    let companyId: number;
    if (existingCompanies.length) {
      companyId = existingCompanies[0].id;
    } else {
      const { rows: created } = await pool.query(
        "insert into companies (name, slug, type, status) values ($1, $2, $3, 'active') returning id",
        [`Cliente Demo ${cfg.n}`, slug, cfg.type]
      );
      companyId = created[0].id;
    }

    const { rows: lists } = await pool.query(
      "select id from price_lists where name = $1 and company_id = $2",
      [listName, companyId]
    );
    let listId: number;
    if (lists.length) {
      listId = lists[0].id;
    } else {
      const { rows: created } = await pool.query(
        "insert into price_lists (name, company_id, is_active, is_mp_price_list) values ($1, $2, true, false) returning id",
        [listName, companyId]
      );
      listId = created[0].id;
    }
    await insertItemsIfEmpty(listId, providerProducts.map((p) => ({ id: p.id, price: p.regular_price })));
    await pool.query("update companies set price_list_id = $1 where id = $2", [listId, companyId]);

    const hash = await bcrypt.hash("usuario1234", 12);
    await pool.query(
      "insert into users (email, password, name, role, active, is_mercado_publico, company_id) values ($1, $2, $3, 'cotizador', true, $4, $5) returning id",
      [email, hash, name, cfg.isMp, companyId]
    );
    console.log(`OK ${email} → type=${cfg.type}, empresa=Cliente Demo ${cfg.n}, lista=${listName}`);
  }
}

async function insertItemsIfEmpty(listId: number, items: Array<{ id: number; price: string }>) {
  const { rows } = await pool.query("select count(*)::int as n from price_list_items where price_list_id = $1", [listId]);
  if (rows[0].n > 0) return;
  for (const item of items) {
    await pool.query(
      "insert into price_list_items (price_list_id, product_id, price, discount, min_quantity) values ($1, $2, $3, 0, 1)",
      [listId, item.id, item.price]
    );
  }
}

seed()
  .then(() => pool.end())
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
