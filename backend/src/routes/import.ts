import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db } from "../db/index.js";
import { products, productCategories, categories } from "../db/schema.js";
import { eq } from "drizzle-orm";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

export const importRouter = Router();

const REQUIRED_COLUMNS = ["sku", "name", "regular_price"];

interface ImportRow {
  sku?: string;
  name?: string;
  description?: string;
  short_desc?: string;
  regular_price?: number | string;
  price_chilecompra?: number | string;
  price_convenio_marco?: number | string;
  stock?: number | string;
  status?: string;
  categories?: string;
}

function normalizeHeader(header: string): string {
  const map: Record<string, string> = {
    sku: "sku",
    código: "sku",
    codigo: "sku",
    cod: "sku",
    nombre: "name",
    name: "name",
    producto: "name",
    descripción: "description",
    descripcion: "description",
    description: "description",
    desc_corta: "short_desc",
    "descripción corta": "short_desc",
    "descripcion corta": "short_desc",
    precio: "regular_price",
    precio_regular: "regular_price",
    regular_price: "regular_price",
    price: "regular_price",
    precio_chilecompra: "price_chilecompra",
    chilecompra: "price_chilecompra",
    precio_convenio_marco: "price_convenio_marco",
    "convenio marco": "price_convenio_marco",
    convenio_marco: "price_convenio_marco",
    stock: "stock",
    cantidad: "stock",
    estado: "status",
    status: "status",
    categorías: "categories",
    categorias: "categories",
    categories: "categories",
  };
  return map[header.toLowerCase().trim()] || header.toLowerCase().trim();
}

function parseRows(rows: unknown[]): { normalized: ImportRow[]; errors: string[] } {
  const errors: string[] = [];
  const normalized: ImportRow[] = [];

  if (!rows.length) {
    errors.push("El archivo está vacío");
    return { normalized, errors };
  }

  const firstRow = rows[0] as Record<string, unknown>;
  const headers = Object.keys(firstRow);
  const mappedHeaders = headers.map(normalizeHeader);

  const hasRequired = REQUIRED_COLUMNS.every((col) => mappedHeaders.includes(col));
  if (!hasRequired) {
    const missing = REQUIRED_COLUMNS.filter((col) => !mappedHeaders.includes(col));
    errors.push(`Faltan columnas requeridas: ${missing.join(", ")}`);
    return { normalized, errors };
  }

  rows.forEach((row, index) => {
    const data = row as Record<string, unknown>;
    const rowNum = index + 2;

    const entries = mappedHeaders.map((key, i) => [key, data[headers[i]]] as [string, unknown]);
    const obj = Object.fromEntries(entries);

    if (!obj.sku || !String(obj.sku).trim()) {
      errors.push(`Fila ${rowNum}: SKU vacío`);
      return;
    }
    if (!obj.name || !String(obj.name).trim()) {
      errors.push(`Fila ${rowNum}: Nombre vacío`);
      return;
    }
    if (obj.regular_price === undefined || obj.regular_price === null || obj.regular_price === "") {
      errors.push(`Fila ${rowNum}: Precio regular vacío`);
      return;
    }

    const price = Math.round(Number(obj.regular_price));
    if (isNaN(price) || price < 0) {
      errors.push(`Fila ${rowNum}: Precio regular inválido (${obj.regular_price})`);
      return;
    }

    normalized.push({
      sku: String(obj.sku).trim(),
      name: String(obj.name).trim(),
      description: obj.description ? String(obj.description).trim() : undefined,
      short_desc: obj.short_desc ? String(obj.short_desc).trim() : undefined,
      regular_price: price,
      price_chilecompra: obj.price_chilecompra ? Math.round(Number(obj.price_chilecompra)) : undefined,
      price_convenio_marco: obj.price_convenio_marco ? Math.round(Number(obj.price_convenio_marco)) : undefined,
      stock: obj.stock ? Number(obj.stock) : 0,
      status: obj.status ? String(obj.status).trim() : "active",
      categories: obj.categories ? String(obj.categories).trim() : undefined,
    });
  });

  return { normalized, errors };
}

async function resolveCategories(categoryNames: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  for (const rawName of categoryNames) {
    const slug = rawName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const [existing] = await db
      .select()
      .from(categories)
      .where(eq(categories.slug, slug));

    if (existing) {
      result.set(rawName, existing.id);
    } else {
      const [created] = await db
        .insert(categories)
        .values({ name: rawName, slug })
        .returning();
      result.set(rawName, created.id);
    }
  }

  return result;
}

importRouter.post("/import", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      res.status(400).json({ error: "El archivo no tiene hojas" });
      return;
    }

    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    const { normalized, errors } = parseRows(rows);

    if (errors.length && !normalized.length) {
      res.status(400).json({ error: "Errores de validación", details: errors });
      return;
    }

    const confirm = req.body.confirm === "true";

    if (!confirm) {
      res.json({
        status: "preview",
        total_rows: rows.length,
        valid_rows: normalized.length,
        errors,
        preview: normalized.slice(0, 10),
      });
      return;
    }

    const allCategoryNames = new Set<string>();
    for (const row of normalized) {
      if (row.categories) {
        row.categories.split(",").map((c) => c.trim()).filter(Boolean).forEach((c) => allCategoryNames.add(c));
      }
    }

    let categoryMap = new Map<string, number>();
    if (allCategoryNames.size) {
      categoryMap = await resolveCategories([...allCategoryNames]);
    }

    let created = 0;
    let updated = 0;
    const importErrors: string[] = [];

    for (const row of normalized) {
      try {
        const sku = row.sku!;
        const [existing] = await db
          .select({ id: products.id })
          .from(products)
          .where(eq(products.sku, sku));

        if (existing) {
          await db
            .update(products)
            .set({
              name: row.name,
              description: row.description || null,
              shortDesc: row.short_desc || null,
              regularPrice: String(row.regular_price),
              priceChilecompra: row.price_chilecompra ? String(row.price_chilecompra) : null,
              priceConvenioMarco: row.price_convenio_marco ? String(row.price_convenio_marco) : null,
              stock: Number(row.stock) || 0,
              status: row.status || "active",
              updatedAt: new Date(),
            })
            .where(eq(products.id, existing.id));

          if (row.categories) {
            await db.delete(productCategories).where(eq(productCategories.productId, existing.id));
            const catNames = row.categories.split(",").map((c) => c.trim()).filter(Boolean);
            if (catNames.length) {
              await db.insert(productCategories).values(
                catNames.map((name) => ({
                  productId: existing.id,
                  categoryId: categoryMap.get(name)!,
                }))
              );
            }
          }

          updated++;
        } else {
          const [product] = await db
            .insert(products)
            .values({
              sku,
              name: row.name!,
              description: row.description || null,
              shortDesc: row.short_desc || null,
              regularPrice: String(row.regular_price),
              priceChilecompra: row.price_chilecompra ? String(row.price_chilecompra) : null,
              priceConvenioMarco: row.price_convenio_marco ? String(row.price_convenio_marco) : null,
              stock: Number(row.stock) || 0,
              status: row.status || "active",
            })
            .returning();

          if (row.categories) {
            const catNames = row.categories.split(",").map((c) => c.trim()).filter(Boolean);
            if (catNames.length) {
              await db.insert(productCategories).values(
                catNames.map((name) => ({
                  productId: product.id,
                  categoryId: categoryMap.get(name)!,
                }))
              );
            }
          }

          created++;
        }
      } catch (err) {
        importErrors.push(`SKU ${row.sku}: ${(err as Error).message}`);
      }
    }

    res.json({
      status: "completed",
      created,
      updated,
      errors: importErrors,
    });
  } catch (error) {
    console.error("POST /products/import error:", error);
    res.status(500).json({ error: "Error importing products" });
  }
});

importRouter.get("/template", (_req, res) => {
  const headers = [
    "SKU",
    "Nombre",
    "Descripción",
    "Descripción Corta",
    "Precio Regular",
    "Precio ChileCompra",
    "Precio Convenio Marco",
    "Stock",
    "Estado",
    "Categorías",
  ];

  const ws = XLSX.utils.aoa_to_sheet([
    headers,
    [
      "EJ-001",
      "Ejemplo Producto",
      "Descripción larga del producto",
      "Descripción corta",
      10000,
      9500,
      9000,
      100,
      "active",
      "Electrónica, Computación",
    ],
  ]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Productos");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=template_productos.xlsx");
  res.send(Buffer.from(buffer));
});
