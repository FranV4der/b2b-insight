import { Router } from "express";
import { db } from "../db/index.js";
import { categories, productCategories } from "../db/schema.js";
import { eq, asc, sql } from "drizzle-orm";
import { requireAuth, requireEmpresa } from "../middleware/auth.js";
import { slugify } from "../utils/validation.js";

export const categoriesRouter = Router();

categoriesRouter.get("/", async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        parentId: categories.parentId,
        productCount: sql<number>`count(${productCategories.productId})`,
      })
      .from(categories)
      .leftJoin(productCategories, eq(productCategories.categoryId, categories.id))
      .groupBy(categories.id)
      .orderBy(asc(categories.name));

    res.json(rows);
  } catch (error) {
    console.error("GET /categories error:", error);
    res.status(500).json({ error: "Error fetching categories" });
  }
});

categoriesRouter.post("/", requireAuth, requireEmpresa, async (req, res) => {
  try {
    const { name, slug, parentId } = req.body;
    const effectiveSlug = slugify(String(slug || "")) || slugify(String(name || ""));

    if (!name || !effectiveSlug) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const [existing] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, effectiveSlug));

    if (existing) {
      res.status(409).json({ error: `Ya existe una categoría con slug "${effectiveSlug}"` });
      return;
    }

    const [category] = await db
      .insert(categories)
      .values({ name: String(name), slug: effectiveSlug, parentId: parentId || null })
      .returning();

    res.status(201).json(category);
  } catch (error) {
    console.error("POST /categories error:", error);
    res.status(500).json({ error: "Error creating category" });
  }
});

categoriesRouter.delete("/:id", requireAuth, requireEmpresa, async (req, res) => {
  try {
    const id = Number(req.params.id);

    const [existing] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, id));

    if (!existing) {
      res.status(404).json({ error: "Category not found" });
      return;
    }

    // Borra también los vínculos product_categories (FK cascade).
    await db.delete(categories).where(eq(categories.id, id));

    res.json({ message: "Category deleted" });
  } catch (error) {
    console.error("DELETE /categories/:id error:", error);
    res.status(500).json({ error: "Error deleting category" });
  }
});