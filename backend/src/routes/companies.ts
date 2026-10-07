import { Router } from "express";
import { db } from "../db/index.js";
import { companies, users } from "../db/schema.js";
import { eq, and, or, ilike, asc, sql, inArray } from "drizzle-orm";
import { requireAuth, requireEmpresa, requireAdmin, scopeCompanyId } from "../middleware/auth.js";
import { slugify, normalizeRut, EMAIL_RE } from "../utils/validation.js";

export const companiesRouter = Router();

const COMPANY_STATUSES = ["pending", "active", "suspended"] as const;
type CompanyStatus = (typeof COMPANY_STATUSES)[number];

companiesRouter.use(requireAuth);
companiesRouter.use(requireEmpresa);

companiesRouter.get("/", async (req, res) => {
  try {
    const search = (req.query.search as string) || "";
    const scopedCompanyId = scopeCompanyId(req.auth);

    const conditions = [];
    // El admin de un vendedor solo ve su propia ficha.
    if (scopedCompanyId !== null) {
      conditions.push(eq(companies.id, scopedCompanyId));
    }
    if (search) {
      conditions.push(
        or(
          ilike(companies.name, `%${search}%`),
          ilike(companies.email, `%${search}%`),
          ilike(companies.rut, `%${search}%`)
        )
      );
    }
    const where = conditions.length ? and(...conditions) : undefined;

    const rows = await db
      .select({
        id: companies.id,
        name: companies.name,
        slug: companies.slug,
        legalName: companies.legalName,
        businessActivity: companies.businessActivity,
        rut: companies.rut,
        address: companies.address,
        commune: companies.commune,
        region: companies.region,
        phone: companies.phone,
        email: companies.email,
        website: companies.website,
        logoUrl: companies.logoUrl,
        contactName: companies.contactName,
        contactRole: companies.contactRole,
        contactEmail: companies.contactEmail,
        contactPhone: companies.contactPhone,
        status: companies.status,
        createdAt: companies.createdAt,
      })
      .from(companies)
      .where(where)
      .orderBy(asc(companies.name));

    const companyIds = rows.map((r) => r.id);
    let userCounts = new Map<number, number>();
    if (companyIds.length) {
      const counts = await db
        .select({ companyId: users.companyId, count: sql<number>`count(*)` })
        .from(users)
        .where(inArray(users.companyId, companyIds))
        .groupBy(users.companyId);
      userCounts = new Map(
        counts
          .filter((c): c is { companyId: number; count: number } => c.companyId !== null)
          .map((c) => [c.companyId, Number(c.count)])
      );
    }

    res.json(rows.map((r) => ({ ...r, userCount: userCounts.get(r.id) || 0 })));
  } catch (error) {
    console.error("GET /companies error:", error);
    res.status(500).json({ error: "Error al obtener empresas" });
  }
});

companiesRouter.post("/", requireAdmin, async (req, res) => {
  try {
    const {
      name,
      legalName,
      businessActivity,
      rut,
      address,
      commune,
      region,
      phone,
      email,
      website,
      logoUrl,
      contactName,
      contactRole,
      contactEmail,
      contactPhone,
      status,
    } = req.body;

    if (!name?.trim()) {
      res.status(400).json({ error: "El nombre de la empresa es requerido" });
      return;
    }

    const slug = slugify(name.trim());
    if (!slug) {
      res.status(400).json({ error: "El nombre no genera un slug válido" });
      return;
    }
    const slugConflict = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.slug, slug));
    if (slugConflict.length) {
      res.status(409).json({ error: `Ya existe una empresa con el slug "${slug}"` });
      return;
    }

    let resolvedRut: string | null = null;
    if (rut !== undefined && rut !== null && String(rut).trim() !== "") {
      const normalized = normalizeRut(String(rut));
      if (!normalized) {
        res.status(400).json({ error: "El RUT no es válido" });
        return;
      }
      resolvedRut = normalized;
    }

    for (const [field, value] of [
      ["email", email],
      ["contactEmail", contactEmail],
    ] as const) {
      if (value !== undefined && value !== null && String(value).trim() !== "" && !EMAIL_RE.test(String(value))) {
        res.status(400).json({ error: `El ${field} no tiene un formato válido` });
        return;
      }
    }

    if (status !== undefined && (typeof status !== "string" || !COMPANY_STATUSES.includes(status as CompanyStatus))) {
      res.status(400).json({ error: "Estado de empresa no válido" });
      return;
    }

    const [created] = await db
      .insert(companies)
      .values({
        name: name.trim(),
        slug,
        legalName: legalName?.trim() || null,
        businessActivity: businessActivity?.trim() || null,
        rut: resolvedRut,
        address: address?.trim() || null,
        commune: commune?.trim() || null,
        region: region?.trim() || null,
        phone: phone?.trim() || null,
        email: email?.trim().toLowerCase() || null,
        website: website?.trim() || null,
        logoUrl: logoUrl?.trim() || null,
        contactName: contactName?.trim() || null,
        contactRole: contactRole?.trim() || null,
        contactEmail: contactEmail?.trim().toLowerCase() || null,
        contactPhone: contactPhone?.trim() || null,
        status: status ?? "pending",
        approvedBy: req.auth!.userId,
      })
      .returning();

    res.status(201).json(created);
  } catch (error) {
    console.error("POST /companies error:", error);
    res.status(500).json({ error: "Error al crear empresa" });
  }
});

companiesRouter.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const {
      name,
      legalName,
      businessActivity,
      rut,
      address,
      commune,
      region,
      phone,
      email,
      website,
      logoUrl,
      contactName,
      contactRole,
      contactEmail,
      contactPhone,
      status,
    } = req.body;

    // El admin de un vendedor solo puede editar su propia ficha. Se responde 404
    // (no 403) para no revelar la existencia de empresas de otros vendedores.
    const scopedCompanyId = scopeCompanyId(req.auth);
    if (scopedCompanyId !== null && scopedCompanyId !== id) {
      res.status(404).json({ error: "Empresa no encontrada" });
      return;
    }

    const [company] = await db.select().from(companies).where(eq(companies.id, id));
    if (!company) {
      res.status(404).json({ error: "Empresa no encontrada" });
      return;
    }

    if (status !== undefined && (typeof status !== "string" || !COMPANY_STATUSES.includes(status as CompanyStatus))) {
      res.status(400).json({ error: "Estado de empresa no válido" });
      return;
    }

    if (name !== undefined && !name?.trim()) {
      res.status(400).json({ error: "El nombre no puede quedar vacío" });
      return;
    }

    let resolvedRut: string | null | undefined;
    if (rut !== undefined) {
      if (rut === null || String(rut).trim() === "") {
        resolvedRut = null;
      } else {
        const normalized = normalizeRut(String(rut));
        if (!normalized) {
          res.status(400).json({ error: "El RUT no es válido" });
          return;
        }
        resolvedRut = normalized;
      }
    }

    for (const [field, value] of [
      ["email", email],
      ["contactEmail", contactEmail],
    ] as const) {
      if (value !== undefined && value !== null && String(value).trim() !== "" && !EMAIL_RE.test(String(value))) {
        res.status(400).json({ error: `El ${field} no tiene un formato válido` });
        return;
      }
    }

    const trimmed = (v: unknown) =>
      v === undefined ? undefined : v === null ? null : String(v).trim() || null;

    const [updated] = await db
      .update(companies)
      .set({
        ...(name !== undefined && { name: name.trim() }),
        ...(legalName !== undefined && { legalName: trimmed(legalName) }),
        ...(businessActivity !== undefined && { businessActivity: trimmed(businessActivity) }),
        ...(resolvedRut !== undefined && { rut: resolvedRut }),
        ...(address !== undefined && { address: trimmed(address) }),
        ...(commune !== undefined && { commune: trimmed(commune) }),
        ...(region !== undefined && { region: trimmed(region) }),
        ...(phone !== undefined && { phone: trimmed(phone) }),
        ...(email !== undefined && { email: trimmed(email)?.toLowerCase() ?? null }),
        ...(website !== undefined && { website: trimmed(website) }),
        ...(logoUrl !== undefined && { logoUrl: trimmed(logoUrl) }),
        ...(contactName !== undefined && { contactName: trimmed(contactName) }),
        ...(contactRole !== undefined && { contactRole: trimmed(contactRole) }),
        ...(contactEmail !== undefined && { contactEmail: trimmed(contactEmail)?.toLowerCase() ?? null }),
        ...(contactPhone !== undefined && { contactPhone: trimmed(contactPhone) }),
        ...(status !== undefined && { status }),
        ...(status === "active" && { approvedAt: new Date(), approvedBy: req.auth!.userId }),
        updatedAt: new Date(),
      })
      .where(eq(companies.id, id))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error("PUT /companies/:id error:", error);
    res.status(500).json({ error: "Error al actualizar empresa" });
  }
});
