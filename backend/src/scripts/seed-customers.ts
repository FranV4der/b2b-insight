import "dotenv/config";
import bcrypt from "bcrypt";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const DEMO_PASSWORD = "demo1234";

/** Compradores demo asignados al vendedor IMEX ESTADO, uno por canal. */
const BUYERS = [
  { name: "Librería Tisca", type: "chilecompra", email: "compras@libreriatisca.cl" },
  { name: "Árbol de Papel", type: "normal", email: "compras@arboldepapel.cl" },
  { name: "Papelería Romi", type: "both", email: "compras@papeleriromi.cl" },
  { name: "Tienda Colores", type: "both", email: "compras@tiendacolores.cl" },
] as const;

async function seed() {
  const { rows: vendors } = await pool.query(
    "select id, name from companies where slug = $1",
    ["imex-estado"]
  );
  if (!vendors.length) {
    throw new Error("Vendedor 'imex-estado' no encontrado. Revisa la base de datos.");
  }
  const companyId = vendors[0].id as number;
  console.log(`Vendedor: ${vendors[0].name} (id=${companyId})`);

  const hash = await bcrypt.hash(DEMO_PASSWORD, 12);

  for (const b of BUYERS) {
    // 1) Ficha del comprador (customers) — se inserta o se corrige la config.
    const { rows: existing } = await pool.query(
      "select id from customers where name = $1",
      [b.name]
    );
    let customerId: number;
    if (existing.length) {
      customerId = existing[0].id;
      await pool.query(
        "update customers set company_id = $1, type = $2, status = 'active', email = $3, updated_at = now() where id = $4",
        [companyId, b.type, b.email, customerId]
      );
      console.log(`UPDATE customer "${b.name}" (id=${customerId}) type=${b.type} company_id=${companyId}`);
    } else {
      const { rows: created } = await pool.query(
        "insert into customers (company_id, kind, name, email, type, status) values ($1, 'empresa', $2, $3, $4, 'active') returning id",
        [companyId, b.name, b.email, b.type]
      );
      customerId = created[0].id;
      console.log(`INSERT customer "${b.name}" (id=${customerId}) type=${b.type} company_id=${companyId}`);
    }

    // 2) Cuenta de acceso (users, rol cotizador) — igual que un auto-registro real.
    const { rows: userExists } = await pool.query(
      "select id from users where email = $1",
      [b.email]
    );
    if (userExists.length) {
      console.log(`  SKIP user ${b.email} (ya existe)`);
      continue;
    }
    await pool.query(
      "insert into users (email, password, name, role, active, is_mercado_publico, customer_id, company_id) values ($1, $2, $3, 'cotizador', true, $4, $5, null)",
      [b.email, hash, b.name, b.type !== "normal", customerId]
    );
    console.log(`  INSERT user ${b.email} (password=${DEMO_PASSWORD}) → customer_id=${customerId}`);
  }

  console.log("\nListo. Cuentas demo (rol cotizador):");
  for (const b of BUYERS) {
    console.log(`  ${b.email}  /  ${DEMO_PASSWORD}   [${b.name} · ${b.type}]`);
  }
}

seed()
  .then(() => pool.end())
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
