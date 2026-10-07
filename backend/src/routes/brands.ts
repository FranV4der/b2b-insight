import { Router } from "express";
import { db } from "../db/index.js";
import { brands, products } from "../db/schema.js";
import { eq, asc, sql } from "drizzle-orm";
import { requireAuth, requireEmpresa } from "../middleware/auth.js";
import { slugify } from "../utils/validation.js";

export const brandsRouter = Router();

brandsRouter.get("/", async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: brands.id,
        name: brands.name,
        slug: brands.slug,
        createdAt: brands.createdAt,
        productCount: sql<number>`count(${products.id})`,
      })
      .from(brands)
      .leftJoin(products, eq(products.brandId, brands.id))
      .groupBy(brands.id, brands.name, brands.slug, brands.createdAt)
      .orderBy(asc(brands.name));

    res.json(rows);
  } catch (error) {
    console.error("GET /brands error:", error);
    res.status(500).json({ error: "Error fetching brands" });
  }
});

brandsRouter.post("/", requireAuth, requireEmpresa, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const slug = slugify(String(req.body.slug || "")) || slugify(name);

    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const [existing] = await db
      .select({ id: brands.id })
      .from(brands)
      .where(eq(brands.slug, slug));

    if (existing) {
      res.status(409).json({ error: `Ya existe una marca con slug "${slug}"` });
      return;
    }

    const [brand] = await db
      .insert(brands)
      .values({ name, slug })
      .returning();

    res.status(201).json(brand);
  } catch (error) {
    console.error("POST /brands error:", error);
    res.status(500).json({ error: "Error creating brand" });
  }
});

brandsRouter.put("/:id", requireAuth, requireEmpresa, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const name = String(req.body.name || "").trim();
    const slug = String(req.body.slug || "").trim();

    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const [existing] = await db
      .select({ id: brands.id })
      .from(brands)
      .where(eq(brands.id, id));

    if (!existing) {
      res.status(404).json({ error: "Brand not found" });
      return;
    }

    const [updated] = await db
      .update(brands)
      .set({
        name,
        ...(slug && { slug }),
        updatedAt: new Date(),
      })
      .where(eq(brands.id, id))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error("PUT /brands/:id error:", error);
    res.status(500).json({ error: "Error updating brand" });
  }
});

brandsRouter.delete("/:id", requireAuth, requireEmpresa, async (req, res) => {
  try {
    const id = Number(req.params.id);

    const [existing] = await db
      .select({ id: brands.id })
      .from(brands)
      .where(eq(brands.id, id));

    if (!existing) {
      res.status(404).json({ error: "Brand not found" });
      return;
    }

    // Los productos quedan sin marca (brand_id = NULL vía FK).
    await db.update(products).set({ brandId: null }).where(eq(products.brandId, id));
    await db.delete(brands).where(eq(brands.id, id));

    res.json({ message: "Brand deleted" });
  } catch (error) {
    console.error("DELETE /brands/:id error:", error);
    res.status(500).json({ error: "Error deleting brand" });
  }
});