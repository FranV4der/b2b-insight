import { Router } from "express";
import bcrypt from "bcrypt";
import { db } from "../db/index.js";
import { users, companies, customers, customerPriceLists, priceLists } from "../db/schema.js";
import { eq, and, isNull } from "drizzle-orm";
import { signToken } from "../middleware/auth.js";
import { EMAIL_RE, normalizeRut } from "../utils/validation.js";

export const authRouter = Router();

const CUSTOMER_TYPES = ["normal", "chilecompra", "both"] as const;
type CustomerType = (typeof CUSTOMER_TYPES)[number];

function normalizeCustomerType(value: unknown, fallback: CustomerType): CustomerType {
  return typeof value === "string" && (CUSTOMER_TYPES as readonly string[]).includes(value)
    ? (value as CustomerType)
    : fallback;
}

interface CustomerPriceListInfo {
  id: number;
  name: string;
  channel: "retail" | "chilecompra";
}

async function customerPriceListsInfo(customerId: number): Promise<CustomerPriceListInfo[]> {
  const rows = await db
    .select({ priceListId: customerPriceLists.priceListId, name: priceLists.name, channel: priceLists.channel })
    .from(customerPriceLists)
    .innerJoin(priceLists, eq(customerPriceLists.priceListId, priceLists.id))
    .where(eq(customerPriceLists.customerId, customerId));
  return rows.map((r) => ({
    id: r.priceListId,
    name: r.name,
    channel: r.channel as "retail" | "chilecompra",
  }));
}

async function customerResponse(customer: {
  id: number;
  kind: string;
  name: string;
  type: string;
  status?: string;
}) {
  const priceListsInfo = await customerPriceListsInfo(customer.id);
  return {
    id: customer.id,
    kind: customer.kind,
    name: customer.name,
    type: customer.type,
    priceLists: priceListsInfo,
    status: customer.status ?? null,
  };
}

/**
 * Resuelve el comprador de una inscripción: reutiliza uno existente con el
 * mismo RUT, o con el mismo nombre si es persona natural (sin RUT).
 */
async function resolveCustomer(params: {
  name: string;
  kind: "persona" | "empresa";
  rut: string | null;
  phone?: string | null;
  address?: string | null;
  email: string;
  type: CustomerType;
}): Promise<{ id: number; created: boolean }> {
  const { name, kind, rut, phone, address, email, type } = params;

  const match = rut
    ? await db.select({ id: customers.id }).from(customers).where(eq(customers.rut, rut))
    : kind === "persona"
      ? await db
          .select({ id: customers.id })
          .from(customers)
          .where(and(eq(customers.name, name), isNull(customers.rut)))
      : [];

  if (match.length) {
    return { id: match[0].id, created: false };
  }

  const [created] = await db
    .insert(customers)
    .values({
      kind,
      name,
      rut,
      phone: phone ?? null,
      address: address ?? null,
      email: email.toLowerCase(),
      type,
    })
    .returning({ id: customers.id });
  return { id: created.id, created: true };
}

async function sessionPayload(user: {
  id: number;
  email: string;
  name: string;
  role: string;
  companyId: number | null;
  customerId: number | null;
  isMercadoPublico: boolean;
}) {
  const token = signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    companyId: user.companyId,
    customerId: user.customerId,
  });

  const [company] =
    user.companyId === null
      ? []
      : await db.select().from(companies).where(eq(companies.id, user.companyId));
  const [customer] =
    user.customerId === null
      ? []
      : await db.select().from(customers).where(eq(customers.id, user.customerId));

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
      customerId: user.customerId,
      isMercadoPublico: user.isMercadoPublico,
    },
    company: company
      ? {
          id: company.id,
          kind: "empresa",
          name: company.name,
          type: "normal",
          priceLists: [],
          status: company.status ?? null,
        }
      : null,
    customer: customer ? await customerResponse(customer) : null,
  };
}

/**
 * Alta de comprador. El registro público nunca crea vendedores: los vendedores
 * (`companies`) los habilita la plataforma. Ambos endpoints generan un comprador
 * (`customers`) y un usuario con rol `cotizador`.
 */
authRouter.post("/register", async (req, res) => {
  try {
    const { email, password, name, companyName, companyRut, companyAddress, companyPhone, companyType } = req.body;

    if (!email || !password || !name || !companyName) {
      res.status(400).json({ error: "Email, contraseña, nombre y nombre de empresa son requeridos" });
      return;
    }
    if (!EMAIL_RE.test(email)) {
      res.status(400).json({ error: "El formato del email no es válido" });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres" });
      return;
    }

    const normalizedEmail = email.toLowerCase();
    const [existingEmail] = await db.select({ id: users.id }).from(users).where(eq(users.email, normalizedEmail));
    if (existingEmail) {
      res.status(409).json({ error: "Ya existe una cuenta con este email" });
      return;
    }

    let resolvedRut: string | null = null;
    if (companyRut !== undefined && companyRut !== null && String(companyRut).trim() !== "") {
      const normalized = normalizeRut(String(companyRut));
      if (!normalized) {
        res.status(400).json({ error: "El RUT no es válido" });
        return;
      }
      resolvedRut = normalized;
    }

    const type = normalizeCustomerType(companyType, "normal");
    const { id: customerId } = await resolveCustomer({
      name: companyName.trim(),
      kind: "empresa",
      rut: resolvedRut,
      phone: companyPhone ?? null,
      address: companyAddress ?? null,
      email: normalizedEmail,
      type,
    });

    const hashedPassword = await bcrypt.hash(password, 12);
    const [user] = await db
      .insert(users)
      .values({
        email: normalizedEmail,
        password: hashedPassword,
        name: name.trim(),
        role: "cotizador",
        customerId,
        companyId: null,
        isMercadoPublico: type !== "normal",
      })
      .returning();

    res.status(201).json(await sessionPayload(user));
  } catch (error) {
    console.error("POST /auth/register error:", error);
    res.status(500).json({ error: "Error al registrar" });
  }
});

/**
 * Alta de comprador. Si no se indica institución se registra como persona
 * natural: en ese caso el usuario compra sin organización asociada.
 */
authRouter.post("/register-cotizador", async (req, res) => {
  try {
    const { email, password, name, phone, institution, rut, companyType, kind } = req.body;

    if (!email || !password || !name) {
      res.status(400).json({ error: "Email, contraseña y nombre son requeridos" });
      return;
    }
    if (!EMAIL_RE.test(email)) {
      res.status(400).json({ error: "El formato del email no es válido" });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres" });
      return;
    }

    const normalizedEmail = email.toLowerCase();
    const [existingEmail] = await db.select({ id: users.id }).from(users).where(eq(users.email, normalizedEmail));
    if (existingEmail) {
      res.status(409).json({ error: "Ya existe una cuenta con este email" });
      return;
    }

    let resolvedKind: "persona" | "empresa" = kind === "persona" ? "persona" : "empresa";
    if (resolvedKind === "empresa" && !institution) resolvedKind = "persona";
    if (resolvedKind === "persona" && institution) resolvedKind = "empresa";

    let resolvedRut: string | null = null;
    if (resolvedKind === "empresa" && rut !== undefined && rut !== null && String(rut).trim() !== "") {
      const normalized = normalizeRut(String(rut));
      if (!normalized) {
        res.status(400).json({ error: "El RUT no es válido" });
        return;
      }
      resolvedRut = normalized;
    }

    const type = normalizeCustomerType(companyType, resolvedKind === "empresa" ? "chilecompra" : "normal");
    const customerName = (institution?.trim() || name.trim());

    const { id: customerId } = await resolveCustomer({
      name: customerName,
      kind: resolvedKind,
      rut: resolvedRut,
      phone: phone ?? null,
      email: normalizedEmail,
      type,
    });

    const hashedPassword = await bcrypt.hash(password, 12);
    const [user] = await db
      .insert(users)
      .values({
        email: normalizedEmail,
        password: hashedPassword,
        name: name.trim(),
        role: "cotizador",
        customerId,
        companyId: null,
        isMercadoPublico: type !== "normal",
      })
      .returning();

    res.status(201).json(await sessionPayload(user));
  } catch (error) {
    console.error("POST /auth/register-cotizador error:", error);
    res.status(500).json({ error: "Error al registrar cotizador" });
  }
});

authRouter.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "Email y contraseña son requeridos" });
      return;
    }

    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    if (!user) {
      res.status(401).json({ error: "Credenciales inválidas" });
      return;
    }

    if (!user.active) {
      res.status(403).json({ error: "Tu cuenta está desactivada. Contacta al administrador." });
      return;
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      res.status(423).json({ error: "Cuenta bloqueada temporalmente. Intenta de nuevo más tarde." });
      return;
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      const attempts = (user.failedLoginAttempts || 0) + 1;
      const lockUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await db.update(users).set({
        failedLoginAttempts: attempts,
        ...(lockUntil && { lockedUntil: lockUntil }),
      }).where(eq(users.id, user.id));
      res.status(401).json({ error: "Credenciales inválidas" });
      return;
    }

    await db.update(users).set({
      failedLoginAttempts: 0,
      lockedUntil: null,
    }).where(eq(users.id, user.id));

    res.json(await sessionPayload(user));
  } catch (error) {
    console.error("POST /auth/login error:", error);
    res.status(500).json({ error: "Error al iniciar sesión" });
  }
});

authRouter.get("/me", async (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }

  try {
    const jwt = await import("jsonwebtoken");
    const payload = jwt.default.verify(header.slice(7), process.env.JWT_SECRET!) as {
      userId: number;
    };

    const [user] = await db.select().from(users).where(eq(users.id, payload.userId));
    if (!user || !user.active) {
      res.status(401).json({ error: "Usuario no encontrado o desactivado" });
      return;
    }

    res.json(await sessionPayload(user));
  } catch {
    res.status(401).json({ error: "Token inválido" });
  }
});
