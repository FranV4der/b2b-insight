import { Router } from "express";
import { db } from "../db/index.js";
import { products, productCategories, categories, productImages, priceListItems, productDocuments, brands } from "../db/schema.js";
import { eq, sql, asc, and, inArray, exists } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { requireAuth, requireEmpresa, getAuthFromRequest, scopeCompanyId } from "../middleware/auth.js";
import { resolvePriceContext } from "../services/pricing.js";

export const productsRouter = Router();

productsRouter.get("/", async (req, res) => {
  try {
    const search = req.query.search as string | undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const perPage = Math.min(100, Math.max(1, Number(req.query.per_page) || 20));
    const status = (req.query.status as string) || "active";

    const auth = getAuthFromRequest(req);
    const ctx = await resolvePriceContext(auth?.customerId ?? undefined, req.query.channel as string | undefined);

    const conditions = [eq(products.status, status)];

    if (req.query.featured === "1" || req.query.featured === "true") {
      conditions.push(eq(products.featured, true));
    }

    if (search) {
      conditions.push(
        sql`(${products.name} ILIKE ${`%${search}%`} OR ${products.sku} ILIKE ${`%${search}%`})`
      );
    }

    const categoryId = Number(req.query.category_id);
    if (Number.isInteger(categoryId) && categoryId > 0) {
      const inCategory = db
        .select({ one: sql`1` })
        .from(productCategories)
        .where(and(
          eq(productCategories.categoryId, categoryId),
          eq(productCategories.productId, products.id),
        ));
      conditions.push(exists(inCategory));
    }

    // Filtros de precio (sobre el precio base de lista, no sobre el asignado
    // por cliente, que depende del usuario autenticado).
    const minPrice = Number(req.query.min_price);
    if (Number.isFinite(minPrice) && String(req.query.min_price ?? "") !== "") {
      conditions.push(sql`${products.regularPrice} >= ${minPrice}`);
    }
    const maxPrice = Number(req.query.max_price);
    if (Number.isFinite(maxPrice) && String(req.query.max_price ?? "") !== "") {
      conditions.push(sql`${products.regularPrice} <= ${maxPrice}`);
    }

    if (req.query.in_stock === "1" || req.query.in_stock === "true") {
      conditions.push(sql`${products.stock} > 0`);
    }

    // Filtros técnicos por dimensiones (en cm).
    type DimensionColumn =
      | typeof products.lengthCm
      | typeof products.widthCm
      | typeof products.heightCm;
    const dimensionFilters: [string, DimensionColumn, "min" | "max"][] = [
      ["min_length", products.lengthCm, "min"],
      ["max_length", products.lengthCm, "max"],
      ["min_width", products.widthCm, "min"],
      ["max_width", products.widthCm, "max"],
      ["min_height", products.heightCm, "min"],
      ["max_height", products.heightCm, "max"],
    ];
    for (const [param, column, bound] of dimensionFilters) {
      const raw = req.query[param];
      if (raw === undefined || String(raw).trim() === "") continue;
      const value = Number(raw);
      if (!Number.isFinite(value)) continue;
      if (bound === "min") {
        conditions.push(sql`${column} >= ${value} AND ${column} IS NOT NULL`);
      } else {
        conditions.push(sql`${column} <= ${value} AND ${column} IS NOT NULL`);
      }
    }

    const where = and(...conditions);

    const [countResult, rows] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(products)
        .where(where),
      db
        .select()
        .from(products)
        .where(where)
        .orderBy(asc(products.name))
        .limit(perPage)
        .offset((page - 1) * perPage),
    ]);

    const total = Number(countResult[0]?.count || 0);

    const productIds = rows.map((r) => r.id);

    let brandMap = new Map<number, string>();
    const brandIds = rows.map((r) => r.brandId).filter((v): v is number => v != null);
    if (brandIds.length) {
      const brandRows = await db
        .select({ id: brands.id, name: brands.name })
        .from(brands)
        .where(inArray(brands.id, brandIds));
      brandMap = new Map(brandRows.map((b) => [b.id, b.name]));
    }

    const priceMap = new Map<number, { price: string; discount: string }>();
    const priceListIds: number[] = [];
    if (ctx.channel) {
      if (ctx.priceListId) {
        priceListIds.push(ctx.priceListId);
      } else if (ctx.channel === "chilecompra") {
        priceListIds.push(...Array.from(ctx.mpPriceListsByProvider.values()));
      }
    }
    if (priceListIds.length && productIds.length) {
      const prices = await db
        .select()
        .from(priceListItems)
        .where(and(inArray(priceListItems.priceListId, priceListIds), inArray(priceListItems.productId, productIds)));
      for (const p of prices) {
        priceMap.set(p.productId, { price: p.price, discount: p.discount || "0" });
      }
    }

    let mainImages: { productId: number; url: string; alt: string | null }[] = [];
    if (productIds.length) {
      const subQuery = db
        .select({
          productId: productImages.productId,
          url: productImages.url,
          alt: productImages.alt,
          rn: sql<number>`row_number() OVER (PARTITION BY ${productImages.productId} ORDER BY ${productImages.sortOrder})`.as("rn"),
        })
        .from(productImages)
        .where(inArray(productImages.productId, productIds))
        .as("imgs");

      mainImages = await db
        .select({ productId: subQuery.productId, url: subQuery.url, alt: subQuery.alt })
        .from(subQuery)
        .where(sql`${subQuery.rn} = 1`);
    }

    const imagesByProduct = new Map(mainImages.map((img) => [img.productId, img]));

    const data = rows.map((row) => {
      const base = {
        ...row,
        brandName: row.brandId ? brandMap.get(row.brandId) || null : null,
        images: imagesByProduct.has(row.id) ? [imagesByProduct.get(row.id)] : [],
      };
      if (!auth) {
        return {
          ...base,
          regularPrice: null,
          priceChilecompra: null,
          priceConvenioMarco: null,
          priceListPrice: null,
          priceListDiscount: null,
        };
      }
      const pl = priceMap.get(row.id);
      return {
        ...base,
        priceListPrice: pl?.price || null,
        priceListDiscount: pl?.discount || null,
      };
    });

    res.json({
      data,
      pagination: {
        page,
        per_page: perPage,
        total,
        total_pages: Math.ceil(total / perPage),
      },
    });
  } catch (error) {
    console.error("GET /products error:", error);
    res.status(500).json({ error: "Error fetching products" });
  }
});

productsRouter.get("/my-price", async (req, res) => {
  try {
    const auth = getAuthFromRequest(req);
    const ctx = await resolvePriceContext(auth?.customerId ?? undefined, req.query.channel as string | undefined);

    let priceListId: number | null = null;
    if (ctx.channel) {
      if (ctx.priceListId) {
        priceListId = ctx.priceListId;
      } else if (ctx.channel === "chilecompra") {
        const ids = Array.from(ctx.mpPriceListsByProvider.values());
        priceListId = ids[0] ?? null;
      }
    }

    if (!priceListId) {
      res.status(400).json({ error: "El cliente no tiene una lista de precio asignada" });
      return;
    }

    const items = await db
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        description: products.description,
        shortDesc: products.shortDesc,
        stock: products.stock,
        status: products.status,
        price: priceListItems.price,
        discount: priceListItems.discount,
        minQuantity: priceListItems.minQuantity,
      })
      .from(priceListItems)
      .innerJoin(products, eq(priceListItems.productId, products.id))
      .where(and(eq(priceListItems.priceListId, priceListId), eq(products.status, "active")));

    res.json({ data: items });
  } catch (error) {
    console.error("GET /products/my-price error:", error);
    res.status(500).json({ error: "Error fetching products" });
  }
});

/**
 * Autocompletado para el buscador del catálogo. Devuelve pocos campos a propósito:
 * el precio se muestra por separado y solo si el usuario está autenticado.
 */
productsRouter.get("/search", async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    if (!search) {
      res.json([]);
      return;
    }
    const rows = await db
      .select({ id: products.id, sku: products.sku, name: products.name, stock: products.stock })
      .from(products)
      .where(and(
        eq(products.status, "active"),
        sql`(${products.name} ILIKE ${`%${search}%`} OR ${products.sku} ILIKE ${`%${search}%`})`,
      ))
      .orderBy(asc(products.sku))
      .limit(8);
    res.json(rows);
  } catch (error) {
    console.error("GET /products/search error:", error);
    res.status(500).json({ error: "Error en la búsqueda" });
  }
});

productsRouter.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, id));

    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    const productCategoriesList = await db
      .select({ categoryId: productCategories.categoryId, name: categories.name, slug: categories.slug })
      .from(productCategories)
      .innerJoin(categories, eq(productCategories.categoryId, categories.id))
      .where(eq(productCategories.productId, id));

    const productImagesList = await db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, id))
      .orderBy(asc(productImages.sortOrder));

    const documentsList = await db
      .select()
      .from(productDocuments)
      .where(eq(productDocuments.productId, id))
      .orderBy(asc(productDocuments.createdAt));

    const auth = getAuthFromRequest(req);

    let brandName: string | null = null;
    if (product.brandId) {
      const [brandRow] = await db
        .select({ name: brands.name })
        .from(brands)
        .where(eq(brands.id, product.brandId));
      brandName = brandRow?.name ?? null;
    }

    if (!auth) {
      res.json({
        ...product,
        brandName,
        regularPrice: null,
        priceChilecompra: null,
        priceConvenioMarco: null,
        priceListPrice: null,
        priceListDiscount: null,
        categories: productCategoriesList,
        images: productImagesList,
        documents: documentsList,
      });
      return;
    }

    const ctx = await resolvePriceContext(auth?.customerId ?? undefined, req.query.channel as string | undefined);

    let priceListId: number | null = null;
    if (ctx.channel) {
      if (ctx.priceListId) {
        priceListId = ctx.priceListId;
      } else if (ctx.channel === "chilecompra") {
        priceListId = product.companyId != null ? (ctx.mpPriceListsByProvider.get(product.companyId) ?? null) : null;
      }
    }

    let priceListPrice: string | null = null;
    let priceListDiscount: string | null = null;
    if (priceListId) {
      const [priceItem] = await db
        .select()
        .from(priceListItems)
        .where(and(eq(priceListItems.priceListId, priceListId), eq(priceListItems.productId, id)));
      if (priceItem) {
        priceListPrice = priceItem.price;
        priceListDiscount = priceItem.discount || "0";
      }
    }

    res.json({ ...product, brandName, categories: productCategoriesList, images: productImagesList, documents: documentsList, priceListPrice, priceListDiscount });
  } catch (error) {
    console.error("GET /products/:id error:", error);
    res.status(500).json({ error: "Error fetching product" });
  }
});

type MeasureFields = Partial<Record<"lengthCm" | "widthCm" | "heightCm" | "weightKg", string | null>>;

const MEASURE_KEYS: (keyof MeasureFields)[] = ["lengthCm", "widthCm", "heightCm", "weightKg"];

/**
 * Valida las medidas del producto. Devuelve solo las claves que llegaron en el
 * body, para no borrar valores existentes en un PUT parcial.
 */
function validateMeasures(body: Record<string, unknown>): { error?: string; values: MeasureFields } {
  const values: MeasureFields = {};
  for (const key of MEASURE_KEYS) {
    const raw = body[key];
    if (raw === undefined) continue;
    if (raw === null || String(raw).trim() === "") {
      values[key] = null;
      continue;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return { error: `La medida ${key} debe ser un número positivo`, values: {} };
    }
    values[key] = String(parsed);
  }
  return { values };
}

productsRouter.post("/", requireAuth, requireEmpresa, async (req, res) => {
  try {
    const {
      sku,
      name,
      description,
      shortDesc,
      regularPrice,
      priceChilecompra,
      priceConvenioMarco,
      stock,
      status,
      categoryIds,
      brandId,
      featured,
    } = req.body;

    if (!sku || !name || regularPrice === undefined) {
      res.status(400).json({ error: "sku, name, and regularPrice are required" });
      return;
    }

    const measures = validateMeasures(req.body);
    if (measures.error) {
      res.status(400).json({ error: measures.error });
      return;
    }

    const [existing] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.sku, sku));

    if (existing) {
      res.status(409).json({ error: `Product with SKU "${sku}" already exists` });
      return;
    }

    const [product] = await db
      .insert(products)
      .values({
        sku,
        name,
        description,
        shortDesc,
        regularPrice: String(regularPrice),
        priceChilecompra: priceChilecompra ? String(priceChilecompra) : null,
        priceConvenioMarco: priceConvenioMarco ? String(priceConvenioMarco) : null,
        stock: stock || 0,
        status: status || "active",
        ...measures.values,
        companyId: req.auth!.companyId,
        ...(brandId !== undefined && { brandId: brandId || null }),
        ...(featured !== undefined && { featured: Boolean(featured) }),
      })
      .returning();

    if (categoryIds?.length) {
      await db.insert(productCategories).values(
        categoryIds.map((categoryId: number) => ({
          productId: product.id,
          categoryId,
        }))
      );
    }

    res.status(201).json(product);
  } catch (error) {
    console.error("POST /products error:", error);
    res.status(500).json({ error: "Error creating product" });
  }
});

productsRouter.put("/:id", requireAuth, requireEmpresa, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const {
      sku,
      name,
      description,
      shortDesc,
      regularPrice,
      priceChilecompra,
      priceConvenioMarco,
      stock,
      status,
      categoryIds,
      brandId,
      featured,
    } = req.body;

    const measures = validateMeasures(req.body);
    if (measures.error) {
      res.status(400).json({ error: measures.error });
      return;
    }

    const scope = scopeCompanyId(req.auth);
    const productScope = scope === null ? eq(products.id, id) : and(eq(products.id, id), eq(products.companyId, scope));

    const [existing] = await db
      .select()
      .from(products)
      .where(productScope);

    if (!existing) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    if (sku && sku !== existing.sku) {
      const [skuConflict] = await db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.sku, sku));
      if (skuConflict) {
        res.status(409).json({ error: `SKU "${sku}" is already in use` });
        return;
      }
    }

    const [updated] = await db
      .update(products)
      .set({
        ...(sku !== undefined && { sku }),
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(shortDesc !== undefined && { shortDesc }),
        ...(regularPrice !== undefined && { regularPrice: String(regularPrice) }),
        ...(priceChilecompra !== undefined && { priceChilecompra: priceChilecompra ? String(priceChilecompra) : null }),
        ...(priceConvenioMarco !== undefined && { priceConvenioMarco: priceConvenioMarco ? String(priceConvenioMarco) : null }),
        ...(stock !== undefined && { stock }),
        ...(status !== undefined && { status }),
        ...(brandId !== undefined && { brandId: brandId || null }),
        ...(featured !== undefined && { featured: Boolean(featured) }),
        ...measures.values,
        updatedAt: new Date(),
      })
      .where(eq(products.id, id))
      .returning();

    if (categoryIds) {
      await db.delete(productCategories).where(eq(productCategories.productId, id));
      if (categoryIds.length) {
        await db.insert(productCategories).values(
          categoryIds.map((categoryId: number) => ({
            productId: id,
            categoryId,
          }))
        );
      }
    }

    res.json(updated);
  } catch (error) {
    console.error("PUT /products/:id error:", error);
    res.status(500).json({ error: "Error updating product" });
  }
});

productsRouter.delete("/:id", requireAuth, requireEmpresa, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const scope = scopeCompanyId(req.auth);
    const productScope = scope === null ? eq(products.id, id) : and(eq(products.id, id), eq(products.companyId, scope));

    const [product] = await db
      .select()
      .from(products)
      .where(productScope);

    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    const imagesList = await db.select().from(productImages).where(eq(productImages.productId, id));
    for (const img of imagesList) {
      const filePath = path.resolve(img.url.slice(1));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    const imagesDir = path.resolve(`uploads/images/${id}`);
    if (fs.existsSync(imagesDir)) fs.rmSync(imagesDir, { recursive: true });

    if (product.technicalSheetUrl) {
      const pdfPath = path.resolve(product.technicalSheetUrl.slice(1));
      if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
    }

    await db.delete(products).where(eq(products.id, id));

    res.json({ message: "Product deleted" });
  } catch (error) {
    console.error("DELETE /products/:id error:", error);
    res.status(500).json({ error: "Error deleting product" });
  }
});
