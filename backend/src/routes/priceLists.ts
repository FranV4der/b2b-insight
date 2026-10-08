import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db } from "../db/index.js";
import { priceLists, priceListItems, products } from "../db/schema.js";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth, requireEmpresa, isAdminRequest, scopeCompanyId } from "../middleware/auth.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

export const priceListsRouter = Router();

priceListsRouter.use(requireAuth);
priceListsRouter.use(requireEmpresa);

/** El admin de plataforma no pertenece a una empresa: entonces no se acota por company_id. */
function scopedList(listId: number, auth: import("express").Request["auth"]) {
  const scope = scopeCompanyId(auth);
  return scope === null
    ? eq(priceLists.id, listId)
    : and(eq(priceLists.id, listId), eq(priceLists.companyId, scope));
}

priceListsRouter.get("/", async (req, res) => {
  try {
    const scope = scopeCompanyId(req.auth);
    const rows = await db
      .select()
      .from(priceLists)
      .where(scope === null ? undefined : eq(priceLists.companyId, scope))
      .orderBy(priceLists.name);
    res.json(rows);
  } catch (error) {
    console.error("GET /price-lists error:", error);
    res.status(500).json({ error: "Error al obtener listas de precio" });
  }
});

priceListsRouter.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [list] = await db
      .select()
      .from(priceLists)
      .where(scopedList(id, req.auth));
    if (!list) {
      res.status(404).json({ error: "Lista de precio no encontrada" });
      return;
    }
    const items = await db
      .select({
        id: priceListItems.id,
        priceListId: priceListItems.priceListId,
        productId: priceListItems.productId,
        price: priceListItems.price,
        discount: priceListItems.discount,
        minQuantity: priceListItems.minQuantity,
        productSku: products.sku,
        productName: products.name,
      })
      .from(priceListItems)
      .leftJoin(products, eq(priceListItems.productId, products.id))
      .where(eq(priceListItems.priceListId, id));
    res.json({ ...list, items });
  } catch (error) {
    console.error("GET /price-lists/:id error:", error);
    res.status(500).json({ error: "Error al obtener lista de precio" });
  }
});

priceListsRouter.post("/", async (req, res) => {
  try {
    const { name, channel, companyId: targetCompanyId, isMpPriceList } = req.body;
    if (!name?.trim()) {
      res.status(400).json({ error: "El nombre es requerido" });
      return;
    }
    // Compatibilidad: si un cliente viejo manda isMpPriceList, se mapea a canal.
    let resolvedChannel = channel;
    if (resolvedChannel === undefined && isMpPriceList !== undefined) {
      resolvedChannel = isMpPriceList ? "chilecompra" : "retail";
    }
    if (resolvedChannel !== "retail" && resolvedChannel !== "chilecompra") {
      res.status(400).json({ error: "Canal no válido (retail | chilecompra)" });
      return;
    }
    let companyId = req.auth!.companyId;
    if (isAdminRequest(req)) {
      if (targetCompanyId === undefined || targetCompanyId === null) {
        res.status(400).json({ error: "El administrador debe indicar la empresa destinataria" });
        return;
      }
      companyId = Number(targetCompanyId);
    }
    const [list] = await db
      .insert(priceLists)
      .values({ name: name.trim(), companyId, channel: resolvedChannel })
      .returning();
    res.status(201).json(list);
  } catch (error) {
    console.error("POST /price-lists error:", error);
    res.status(500).json({ error: "Error al crear lista de precio" });
  }
});

priceListsRouter.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, isActive, channel, isMpPriceList } = req.body;
    const [existing] = await db
      .select()
      .from(priceLists)
      .where(scopedList(id, req.auth));
    if (!existing) {
      res.status(404).json({ error: "Lista de precio no encontrada" });
      return;
    }
    let resolvedChannel = channel;
    if (resolvedChannel === undefined && isMpPriceList !== undefined) {
      resolvedChannel = isMpPriceList ? "chilecompra" : "retail";
    }
    if (resolvedChannel !== undefined && resolvedChannel !== "retail" && resolvedChannel !== "chilecompra") {
      res.status(400).json({ error: "Canal no válido (retail | chilecompra)" });
      return;
    }
    const [updated] = await db
      .update(priceLists)
      .set({
        ...(name !== undefined && { name: name.trim() }),
        ...(isActive !== undefined && { isActive }),
        ...(resolvedChannel !== undefined && { channel: resolvedChannel }),
      })
      .where(eq(priceLists.id, id))
      .returning();
    res.json(updated);
  } catch (error) {
    console.error("PUT /price-lists/:id error:", error);
    res.status(500).json({ error: "Error al actualizar lista de precio" });
  }
});

priceListsRouter.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db
      .select()
      .from(priceLists)
      .where(scopedList(id, req.auth));
    if (!existing) {
      res.status(404).json({ error: "Lista de precio no encontrada" });
      return;
    }
    await db.delete(priceLists).where(eq(priceLists.id, id));
    res.json({ message: "Lista de precio eliminada" });
  } catch (error) {
    console.error("DELETE /price-lists/:id error:", error);
    res.status(500).json({ error: "Error al eliminar lista de precio" });
  }
});

priceListsRouter.post("/:id/items", async (req, res) => {
  try {
    const priceListId = Number(req.params.id);
    const [list] = await db
      .select()
      .from(priceLists)
      .where(scopedList(priceListId, req.auth));
    if (!list) {
      res.status(404).json({ error: "Lista de precio no encontrada" });
      return;
    }
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "Se requiere un array de items" });
      return;
    }
    const inserted = await db
      .insert(priceListItems)
      .values(
        items.map((item: { productId: number; price: number; discount?: number; minQuantity?: number }) => ({
          priceListId,
          productId: item.productId,
          price: String(item.price),
          discount: item.discount != null ? String(item.discount) : "0",
          minQuantity: item.minQuantity ?? 1,
        }))
      )
      .returning();
    res.status(201).json(inserted);
  } catch (error) {
    console.error("POST /price-lists/:id/items error:", error);
    res.status(500).json({ error: "Error al agregar items" });
  }
});

priceListsRouter.put("/items/:itemId", async (req, res) => {
  try {
    const itemId = Number(req.params.itemId);
    const [item] = await db
      .select({ id: priceListItems.id, priceListId: priceListItems.priceListId })
      .from(priceListItems)
      .where(eq(priceListItems.id, itemId));
    if (!item) {
      res.status(404).json({ error: "Item no encontrado" });
      return;
    }
    const [list] = await db
      .select()
      .from(priceLists)
      .where(scopedList(item.priceListId, req.auth));
    if (!list) {
      res.status(403).json({ error: "Acceso denegado" });
      return;
    }
    const { price, discount, minQuantity } = req.body;
    const [updated] = await db
      .update(priceListItems)
      .set({
        ...(price !== undefined && { price: String(price) }),
        ...(discount !== undefined && { discount: String(discount) }),
        ...(minQuantity !== undefined && { minQuantity }),
      })
      .where(eq(priceListItems.id, itemId))
      .returning();
    res.json(updated);
  } catch (error) {
    console.error("PUT /price-lists/items/:itemId error:", error);
    res.status(500).json({ error: "Error al actualizar item" });
  }
});

priceListsRouter.delete("/items/:itemId", async (req, res) => {
  try {
    const itemId = Number(req.params.itemId);
    const [item] = await db
      .select({ id: priceListItems.id, priceListId: priceListItems.priceListId })
      .from(priceListItems)
      .where(eq(priceListItems.id, itemId));
    if (!item) {
      res.status(404).json({ error: "Item no encontrado" });
      return;
    }
    const [list] = await db
      .select()
      .from(priceLists)
      .where(scopedList(item.priceListId, req.auth));
    if (!list) {
      res.status(403).json({ error: "Acceso denegado" });
      return;
    }
    await db.delete(priceListItems).where(eq(priceListItems.id, itemId));
    res.json({ message: "Item eliminado" });
  } catch (error) {
    console.error("DELETE /price-lists/items/:itemId error:", error);
    res.status(500).json({ error: "Error al eliminar item" });
  }
});

// ─── Carga masiva de precios por Excel ─────────────────────

const PRICE_HEADERS: Record<string, string> = {
  sku: "sku",
  código: "sku",
  codigo: "sku",
  cod: "sku",
  precio: "price",
  precio_lista: "price",
  price: "price",
  "precio (clp)": "price",
  descuento: "discount",
  dto: "discount",
  "descuento %": "discount",
  "dto %": "discount",
  discount: "discount",
  cantidad_minima: "minQuantity",
  "cantidad mínima": "minQuantity",
  "cantidad minima": "minQuantity",
  minquantity: "minQuantity",
  "min quantity": "minQuantity",
};

function normalizePriceHeader(header: string): string {
  return PRICE_HEADERS[header.toLowerCase().trim()] || header.toLowerCase().trim();
}

interface PriceImportRow {
  sku: string;
  price: number;
  discount?: number;
  minQuantity?: number;
}

function parsePriceRows(rows: unknown[]): { normalized: PriceImportRow[]; errors: string[] } {
  const errors: string[] = [];
  const normalized: PriceImportRow[] = [];

  if (!rows.length) {
    errors.push("El archivo está vacío");
    return { normalized, errors };
  }

  const firstRow = rows[0] as Record<string, unknown>;
  const headers = Object.keys(firstRow);
  const mappedHeaders = headers.map(normalizePriceHeader);

  if (!mappedHeaders.includes("sku") || !mappedHeaders.includes("price")) {
    const missing: string[] = [];
    if (!mappedHeaders.includes("sku")) missing.push("SKU");
    if (!mappedHeaders.includes("price")) missing.push("Precio");
    errors.push(`Faltan columnas requeridas: ${missing.join(", ")}`);
    return { normalized, errors };
  }

  rows.forEach((row, index) => {
    const data = row as Record<string, unknown>;
    const rowNum = index + 2;

    const entries = mappedHeaders.map((key, i) => [key, data[headers[i]]] as [string, unknown]);
    const obj = Object.fromEntries(entries);

    const sku = obj.sku ? String(obj.sku).trim() : "";
    if (!sku) {
      errors.push(`Fila ${rowNum}: SKU vacío`);
      return;
    }
    if (obj.price === undefined || obj.price === null || obj.price === "") {
      errors.push(`Fila ${rowNum}: Precio vacío`);
      return;
    }
    const price = Math.round(Number(obj.price));
    if (isNaN(price) || price < 0) {
      errors.push(`Fila ${rowNum}: Precio inválido (${obj.price})`);
      return;
    }

    let discount: number | undefined;
    if (obj.discount !== undefined && obj.discount !== null && String(obj.discount).trim() !== "") {
      const d = Number(obj.discount);
      if (isNaN(d) || d < 0 || d > 100) {
        errors.push(`Fila ${rowNum}: Descuento inválido (${obj.discount})`);
        return;
      }
      discount = d;
    }

    let minQuantity: number | undefined;
    if (obj.minQuantity !== undefined && obj.minQuantity !== null && String(obj.minQuantity).trim() !== "") {
      const q = Number(obj.minQuantity);
      if (isNaN(q) || q < 1) {
        errors.push(`Fila ${rowNum}: Cantidad mínima inválida (${obj.minQuantity})`);
        return;
      }
      minQuantity = Math.round(q);
    }

    normalized.push({ sku, price, discount, minQuantity });
  });

  return { normalized, errors };
}

priceListsRouter.get("/:id/template", async (_req, res) => {
  const ws = XLSX.utils.aoa_to_sheet([
    ["SKU", "Precio", "Descuento %", "Cantidad Mínima"],
    ["EJ-001", 10000, 5, 10],
  ]);
  ws["!cols"] = [{ wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 18 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Precios");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=template_lista_precios.xlsx");
  res.send(Buffer.from(buffer));
});

priceListsRouter.post("/:id/import-prices", upload.single("file"), async (req, res) => {
  try {
    const priceListId = Number(req.params.id);
    const [list] = await db
      .select()
      .from(priceLists)
      .where(scopedList(priceListId, req.auth));
    if (!list) {
      res.status(404).json({ error: "Lista de precio no encontrada" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "No se subió archivo" });
      return;
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      res.status(400).json({ error: "El archivo no tiene hojas" });
      return;
    }
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    const { normalized, errors } = parsePriceRows(rows);

    // Los precios se aplican a productos del MISMO vendedor que la lista.
    const matchedBySku = new Map<string, { id: number; sku: string; name: string }>();
    if (normalized.length && list.companyId != null) {
      const skus = Array.from(new Set(normalized.map((r) => r.sku)));
      const productRows = await db
        .select({ id: products.id, sku: products.sku, name: products.name })
        .from(products)
        .where(and(eq(products.companyId, list.companyId), inArray(products.sku, skus)));
      for (const p of productRows) matchedBySku.set(p.sku, p);
    }

    const unmatchedSkus = Array.from(
      new Set(normalized.filter((r) => !matchedBySku.has(r.sku)).map((r) => r.sku))
    );
    const validRows = normalized.filter((r) => matchedBySku.has(r.sku));

    if (errors.length && !validRows.length) {
      res.status(400).json({ error: "Errores de validación", details: errors });
      return;
    }

    const confirm = req.body.confirm === "true" || req.body.confirm === true;

    if (!confirm) {
      res.json({
        status: "preview",
        total_rows: rows.length,
        valid_rows: validRows.length,
        unmatched_skus: unmatchedSkus,
        errors,
        preview: validRows.slice(0, 10).map((r) => {
          const p = matchedBySku.get(r.sku)!;
          return {
            sku: r.sku,
            productName: p.name,
            price: r.price,
            discount: r.discount,
            minQuantity: r.minQuantity,
          };
        }),
      });
      return;
    }

    let inserted = 0;
    let updated = 0;
    const importErrors: string[] = [];

    for (const r of validRows) {
      const p = matchedBySku.get(r.sku)!;
      try {
        const [existing] = await db
          .select({ id: priceListItems.id })
          .from(priceListItems)
          .where(and(eq(priceListItems.priceListId, priceListId), eq(priceListItems.productId, p.id)));
        if (existing) {
          await db
            .update(priceListItems)
            .set({
              price: String(r.price),
              ...(r.discount !== undefined && { discount: String(r.discount) }),
              ...(r.minQuantity !== undefined && { minQuantity: r.minQuantity }),
            })
            .where(eq(priceListItems.id, existing.id));
          updated++;
        } else {
          await db.insert(priceListItems).values({
            priceListId,
            productId: p.id,
            price: String(r.price),
            discount: r.discount !== undefined ? String(r.discount) : "0",
            minQuantity: r.minQuantity ?? 1,
          });
          inserted++;
        }
      } catch (err) {
        importErrors.push(`SKU ${r.sku}: ${(err as Error).message}`);
      }
    }

    res.json({
      status: "completed",
      inserted,
      updated,
      unmatched_skus: unmatchedSkus.length ? unmatchedSkus : undefined,
      errors: importErrors,
    });
  } catch (error) {
    console.error("POST /price-lists/:id/import-prices error:", error);
    res.status(500).json({ error: "Error al importar precios" });
  }
});
