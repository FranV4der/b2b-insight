import { Router } from "express";
import { db } from "../db/index.js";
import { priceLists, priceListItems, products } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireEmpresa, isAdminRequest, scopeCompanyId } from "../middleware/auth.js";

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
    const { name, isMpPriceList, companyId: targetCompanyId } = req.body;
    if (!name?.trim()) {
      res.status(400).json({ error: "El nombre es requerido" });
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
      .values({ name: name.trim(), companyId, isMpPriceList: !!isMpPriceList })
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
    const { name, isActive, isMpPriceList } = req.body;
    const [existing] = await db
      .select()
      .from(priceLists)
      .where(scopedList(id, req.auth));
    if (!existing) {
      res.status(404).json({ error: "Lista de precio no encontrada" });
      return;
    }
    const [updated] = await db
      .update(priceLists)
      .set({
        ...(name !== undefined && { name: name.trim() }),
        ...(isActive !== undefined && { isActive }),
        ...(isMpPriceList !== undefined && { isMpPriceList }),
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
