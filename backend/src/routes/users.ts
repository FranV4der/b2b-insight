import { Router } from "express";
import bcrypt from "bcrypt";
import { db } from "../db/index.js";
import { users, companies, customers } from "../db/schema.js";
import { eq, and, type SQL } from "drizzle-orm";
import { requireAuth, requireEmpresa, isAdminRequest } from "../middleware/auth.js";
import { toRole } from "../roles.js";

export const usersRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

usersRouter.use(requireAuth);
usersRouter.use(requireEmpresa);

const USER_FIELDS = {
  id: users.id,
  email: users.email,
  name: users.name,
  role: users.role,
  active: users.active,
  isMercadoPublico: users.isMercadoPublico,
  companyId: users.companyId,
  customerId: users.customerId,
  createdAt: users.createdAt,
};

function serialize(user: {
  id: number;
  email: string;
  name: string;
  role: string;
  active: boolean;
  isMercadoPublico: boolean;
  companyId: number | null;
  customerId: number | null;
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    active: user.active,
    isMercadoPublico: user.isMercadoPublico,
    companyId: user.companyId,
    customerId: user.customerId,
    createdAt: user.createdAt,
  };
}

usersRouter.get("/", async (req, res) => {
  try {
    const isAdmin = isAdminRequest(req);
    const companyId = req.auth!.companyId;

    const rows = await db
      .select(USER_FIELDS)
      .from(users)
      .where(isAdmin ? undefined : eq(users.companyId, companyId ?? -1))
      .orderBy(users.name);

    res.json(rows.map(serialize));
  } catch (error) {
    console.error("GET /users error:", error);
    res.status(500).json({ error: "Error al obtener usuarios" });
  }
});

usersRouter.post("/", async (req, res) => {
  try {
    const isAdmin = isAdminRequest(req);
    const ownCompanyId = req.auth!.companyId;
    const {
      email,
      password,
      name,
      role,
      companyId: targetCompanyId,
      customerId: targetCustomerId,
    } = req.body;

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

    const userRole = toRole(role);

    let companyId: number | null;
    if (isAdmin) {
      companyId = targetCompanyId === undefined || targetCompanyId === null ? null : Number(targetCompanyId);
      if (companyId !== null && Number.isNaN(companyId)) {
        res.status(400).json({ error: "companyId inválido" });
        return;
      }
      if (companyId !== null) {
        const [company] = await db
          .select({ id: companies.id })
          .from(companies)
          .where(eq(companies.id, companyId));
        if (!company) {
          res.status(404).json({ error: "La empresa indicada no existe" });
          return;
        }
      }
    } else {
      companyId = ownCompanyId;
    }

    // Un `cotizador` pertenece a un comprador, no a un vendedor.
    let customerId: number | null = null;
    if (userRole === "cotizador") {
      if (targetCustomerId === undefined || targetCustomerId === null) {
        res.status(400).json({ error: "Un usuario cotizador debe indicar customerId" });
        return;
      }
      customerId = Number(targetCustomerId);
      if (Number.isNaN(customerId)) {
        res.status(400).json({ error: "customerId inválido" });
        return;
      }
      const [customer] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.id, customerId));
      if (!customer) {
        res.status(404).json({ error: "El comprador indicado no existe" });
        return;
      }
      companyId = null;
    }

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase()));
    if (existing) {
      res.status(409).json({ error: "Ya existe un usuario con este email" });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const [user] = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        password: hashedPassword,
        name: name.trim(),
        role: userRole,
        companyId,
        customerId,
      })
      .returning();

    res.status(201).json(serialize(user));
  } catch (error) {
    console.error("POST /users error:", error);
    res.status(500).json({ error: "Error al crear usuario" });
  }
});

usersRouter.put("/:id", async (req, res) => {
  try {
    const isAdmin = isAdminRequest(req);
    const companyId = req.auth!.companyId;
    const userId = Number(req.params.id);
    const { name, role, active, email, isMercadoPublico, companyId: targetCompanyId } = req.body;

    const scope: SQL | undefined = isAdmin
      ? undefined
      : and(eq(users.companyId, companyId ?? -1));
    const where = scope ? and(eq(users.id, userId), scope) : eq(users.id, userId);

    const [existing] = await db.select().from(users).where(where);

    if (!existing) {
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    }

    if (email && email.toLowerCase() !== existing.email) {
      if (!EMAIL_RE.test(email)) {
        res.status(400).json({ error: "El formato del email no es válido" });
        return;
      }
      const [emailConflict] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email.toLowerCase()));
      if (emailConflict) {
        res.status(409).json({ error: "Ya existe un usuario con este email" });
        return;
      }
    }

    let nextCompanyId: number | null | undefined;
    if (isAdmin && targetCompanyId !== undefined) {
      nextCompanyId = targetCompanyId === null ? null : Number(targetCompanyId);
      if (nextCompanyId !== null && Number.isNaN(nextCompanyId)) {
        res.status(400).json({ error: "companyId inválido" });
        return;
      }
      if (nextCompanyId !== null) {
        const [company] = await db
          .select({ id: companies.id })
          .from(companies)
          .where(eq(companies.id, nextCompanyId));
        if (!company) {
          res.status(404).json({ error: "La empresa indicada no existe" });
          return;
        }
      }
    }

    const [updated] = await db
      .update(users)
      .set({
        ...(name !== undefined && { name: name.trim() }),
        ...(email !== undefined && { email: email.toLowerCase() }),
        ...(role !== undefined && { role: toRole(role) }),
        ...(active !== undefined && { active: Boolean(active) }),
        ...(isMercadoPublico !== undefined && { isMercadoPublico: Boolean(isMercadoPublico) }),
        ...(nextCompanyId !== undefined && { companyId: nextCompanyId }),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    res.json(serialize(updated));
  } catch (error) {
    console.error("PUT /users/:id error:", error);
    res.status(500).json({ error: "Error al actualizar usuario" });
  }
});

usersRouter.delete("/:id", async (req, res) => {
  try {
    const isAdmin = isAdminRequest(req);
    const companyId = req.auth!.companyId;
    const userId = Number(req.params.id);

    if (userId === req.auth!.userId) {
      res.status(400).json({ error: "No puedes eliminar tu propia cuenta" });
      return;
    }

    const where = isAdmin
      ? eq(users.id, userId)
      : and(eq(users.id, userId), eq(users.companyId, companyId ?? -1));

    const [existing] = await db.select().from(users).where(where);

    if (!existing) {
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    }

    await db.delete(users).where(eq(users.id, userId));
    res.json({ message: "Usuario eliminado" });
  } catch (error) {
    console.error("DELETE /users/:id error:", error);
    res.status(500).json({ error: "Error al eliminar usuario" });
  }
});

usersRouter.get("/company", async (req, res) => {
  try {
    const companyId = req.auth!.companyId;
    if (companyId === null) {
      res.status(400).json({ error: "El administrador de plataforma no pertenece a una empresa" });
      return;
    }
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (!company) {
      res.status(404).json({ error: "Empresa no encontrada" });
      return;
    }
    res.json(company);
  } catch (error) {
    console.error("GET /users/company error:", error);
    res.status(500).json({ error: "Error al obtener empresa" });
  }
});

usersRouter.put("/company", async (req, res) => {
  try {
    const companyId = req.auth!.companyId;
    if (companyId === null) {
      res.status(400).json({ error: "El administrador de plataforma no pertenece a una empresa" });
      return;
    }
    const { name, rut, address, phone, email, priceListId, type } = req.body;

    const validTypes = ["normal", "chilecompra", "both"];
    const [updated] = await db
      .update(companies)
      .set({
        ...(name !== undefined && { name: name.trim() }),
        ...(rut !== undefined && { rut }),
        ...(address !== undefined && { address }),
        ...(phone !== undefined && { phone }),
        ...(email !== undefined && { email }),
        ...(priceListId !== undefined && { priceListId }),
        ...(type !== undefined && validTypes.includes(type) && { type }),
        updatedAt: new Date(),
      })
      .where(eq(companies.id, companyId))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error("PUT /users/company error:", error);
    res.status(500).json({ error: "Error al actualizar empresa" });
  }
});
