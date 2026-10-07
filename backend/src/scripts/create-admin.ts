import "dotenv/config";
import bcrypt from "bcrypt";
import pg from "pg";
import crypto from "crypto";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function usage(): never {
  console.error(
    [
      "Uso:",
      "  npm run create:admin -- <email> <password> [nombre]",
      "",
      "Crea (o actualiza) un usuario con rol 'admin' a nivel de plataforma,",
      "sin empresa asociada (users.company_id = NULL).",
      "",
      "La contraseña se toma del argumento; si se omite, se genera una aleatoria",
      "de 20 caracteres y se imprime una sola vez.",
    ].join("\n")
  );
  process.exit(1);
}

async function createAdmin() {
  const email = process.argv[2];
  const name = process.argv[4]?.trim() || "Administrador";
  if (!email || !EMAIL_RE.test(email)) usage();

  let password = process.argv[3];
  let generated = false;
  if (!password) {
    password = crypto.randomBytes(15).toString("base64url");
    generated = true;
  }
  if (password.length < 12) {
    console.error("La contraseña debe tener al menos 12 caracteres.");
    process.exit(1);
  }

  const normalizedEmail = email.toLowerCase();
  const hash = await bcrypt.hash(password, 12);

  const { rows: existing } = await pool.query("select id from users where email = $1", [
    normalizedEmail,
  ]);

  let userId: number;
  if (existing.length) {
    const { rows: updated } = await pool.query(
      `update users
          set role = 'admin',
              company_id = null,
              password = $2,
              active = true,
              updated_at = now()
        where id = $1
      returning id`,
      [existing[0].id, hash]
    );
    userId = updated[0].id;
    console.log(`Usuario existente promocionado a admin: ${normalizedEmail}`);
  } else {
    const { rows: created } = await pool.query(
      `insert into users (email, password, name, role, active, company_id)
       values ($1, $2, $3, 'admin', true, null)
       returning id`,
      [normalizedEmail, hash, name]
    );
    userId = created[0].id;
    console.log(`Admin creado: ${normalizedEmail}`);
  }

  const { rows: admins } = await pool.query(
    "select count(*)::int as n from users where role = 'admin' and active = true"
  );
  console.log(`id=${userId}  ·  admins activos: ${admins[0].n}`);

  if (generated) {
    console.log(`\nContraseña generada (guárdala ahora, no se vuelve a mostrar):\n  ${password}`);
  }
}

createAdmin()
  .then(() => pool.end())
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });