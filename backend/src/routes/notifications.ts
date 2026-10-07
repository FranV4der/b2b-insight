import { Router } from "express";
import { db } from "../db/index.js";
import { notifications } from "../db/schema.js";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

notificationsRouter.get("/", async (req, res) => {
  try {
    const userId = req.auth!.userId;
    const [unreadResult, rows] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(notifications)
        .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false))),
      db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt))
        .limit(50),
    ]);

    res.json({
      data: rows,
      unread: Number(unreadResult[0]?.count || 0),
    });
  } catch (error) {
    console.error("GET /notifications error:", error);
    res.status(500).json({ error: "Error al obtener notificaciones" });
  }
});

notificationsRouter.put("/read-all", async (req, res) => {
  try {
    const userId = req.auth!.userId;
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    res.json({ ok: true });
  } catch (error) {
    console.error("PUT /notifications/read-all error:", error);
    res.status(500).json({ error: "Error al marcar notificaciones" });
  }
});

notificationsRouter.put("/:id/read", async (req, res) => {
  try {
    const userId = req.auth!.userId;
    const id = Number(req.params.id);

    const [updated] = await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Notificación no encontrada" });
      return;
    }

    res.json(updated);
  } catch (error) {
    console.error("PUT /notifications/:id/read error:", error);
    res.status(500).json({ error: "Error al marcar notificación" });
  }
});
