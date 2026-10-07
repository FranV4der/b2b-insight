import "dotenv/config";
import bcrypt from "bcrypt";
import pg from "pg";
import { slugify, normalizeRut, EMAIL_RE } from "../utils/validation.js";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const COMPANY_STATUSES = ["pending", "active", "suspended"] as const;

function usage(): never {
  console.error(
    [
      "Uso:",
      "  npm run create:company -- --name \"IMEX ESTADO\" [opciones]",
      "",
      "Opciones:",
      "  --name <texto>            Nombre comercial (requerido, genera el slug)",
      "  --legal-name <texto>      Razón social",
      "  --rut <rut>               RUT chileno; se valida el dígito verificador",
      "  --activity <texto>        Giro o actividad económica",
      "  --address <texto>         Dirección",
      "  --commune <texto>         Comuna",
      "  --region <texto>          Región",
      "  --phone <texto>           Teléfono",
      "  --email <correo>          Email general",
      "  --website <url>           Sitio web",
      "  --logo <url>              URL del logo",
      "  --contact-name <texto>    Persona de contacto",
      "  --contact-role <texto>    Cargo del contacto",
      "  --contact-email <correo>  Email del contacto",
      "  --contact-phone <texto>   Teléfono del contacto",
      '  --status <estado>         pending | active | suspended   (default: active)',
      "  --admin-email <correo>    Crea además un usuario rol 'empresa' (admin del vendedor)",
      "  --admin-password <pass>   Password de ese usuario (mín. 12 caracteres)",
      '  --admin-name <texto>      Nombre de ese usuario',
      "",
      "Es idempotente: si el slug ya existe no modifica la empresa existente.",
    ].join("\n")
  );
  process.exit(1);
}

function parseArgs(argv: string[]): Map<string, string> {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) usage();
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) usage();
    args.set(token.slice(2), value);
    i++;
  }
  return args;
}

async function createCompany() {
  const args = parseArgs(process.argv.slice(2));
  const name = args.get("name")?.trim();
  if (!name) usage();

  const slug = slugify(name);
  if (!slug) {
    console.error("El nombre no genera un slug válido.");
    process.exit(1);
  }

  const status = args.get("status") ?? "active";
  if (!COMPANY_STATUSES.includes(status as (typeof COMPANY_STATUSES)[number])) {
    console.error(`--status inválido. Opciones: ${COMPANY_STATUSES.join(", ")}`);
    process.exit(1);
  }

  const rawRut = args.get("rut");
  let rut: string | null = null;
  if (rawRut) {
    const normalized = normalizeRut(rawRut);
    if (!normalized) {
      console.error(`RUT inválido: ${rawRut}`);
      process.exit(1);
    }
    rut = normalized;
  }

  for (const key of ["email", "contact-email"]) {
    const value = args.get(key);
    if (value && !EMAIL_RE.test(value)) {
      console.error(`--${key} inválido: ${value}`);
      process.exit(1);
    }
  }

  const adminEmail = args.get("admin-email")?.toLowerCase();
  const adminPassword = args.get("admin-password");
  const adminName = args.get("admin-name")?.trim() || "Administrador";
  if (adminEmail && !adminPassword) {
    console.error("--admin-email requiere --admin-password.");
    process.exit(1);
  }
  if (adminPassword && adminPassword.length < 12) {
    console.error("La contraseña del admin debe tener al menos 12 caracteres.");
    process.exit(1);
  }
  if (adminEmail && !EMAIL_RE.test(adminEmail)) {
    console.error(`--admin-email inválido: ${adminEmail}`);
    process.exit(1);
  }

  const existing = await pool.query("select id, name from companies where slug = $1", [slug]);
  if (existing.rows.length) {
    console.error(`La empresa "${slug}" ya existe (id=${existing.rows[0].id}). No se modificó.`);
    console.error("Usa el panel admin o PUT /api/companies/:id para actualizarla.");
    process.exit(1);
  }

  const clean = (v?: string) => (v === undefined ? null : v.trim() || null);

  const client = await pool.connect();
  try {
    await client.query("begin");

    const { rows: [company] } = await client.query(
      `insert into companies
         (name, slug, legal_name, business_activity, rut, address, commune, region,
          phone, email, website, logo_url, contact_name, contact_role, contact_email,
          contact_phone, status, approved_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, now())
       returning id, name, slug, rut, status`,
      [
        name,
        slug,
        clean(args.get("legal-name")),
        clean(args.get("activity")),
        rut,
        clean(args.get("address")),
        clean(args.get("commune")),
        clean(args.get("region")),
        clean(args.get("phone")),
        clean(args.get("email"))?.toLowerCase() ?? null,
        clean(args.get("website")),
        clean(args.get("logo")),
        clean(args.get("contact-name")),
        clean(args.get("contact-role")),
        clean(args.get("contact-email"))?.toLowerCase() ?? null,
        clean(args.get("contact-phone")),
        status,
      ]
    );

    console.log(`Vendedor creado: ${company.name} (id=${company.id}, slug=${company.slug}, status=${company.status})`);
    if (rut) console.log(`  RUT: ${rut}`);

    if (adminEmail) {
      const dupe = await client.query("select id from users where email = $1", [adminEmail]);
      if (dupe.rows.length) {
        throw new Error(`Ya existe un usuario con email ${adminEmail}. Cancelo para no dejar la empresa sin admin.`);
      }
      const hash = await bcrypt.hash(adminPassword!, 12);
      const { rows: [admin] } = await client.query(
        `insert into users (email, password, name, role, active, company_id)
         values ($1, $2, $3, 'empresa', true, $4)
         returning id, email, role`,
        [adminEmail, hash, adminName, company.id]
      );
      console.log(`  Admin del vendedor: ${admin.email} (id=${admin.id}, rol=${admin.role})`);
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

createCompany()
  .then(() => pool.end())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });