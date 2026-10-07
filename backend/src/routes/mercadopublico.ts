import { Router } from "express";

/**
 * Proxy de Mercado Público para producción.
 *
 * En desarrollo el ticket se inyecta en el proxy de Vite (`/api/mp`); en
 * producción Vercel reescribe `/api/mp/*` hacia este backend, así que aquí se
 * consulta directamente a la API pública con el ticket server-side (nunca
 * expuesto al cliente).
 */
const MP_BASE = process.env.MERCADO_PUBLICO_API || "https://api.mercadopublico.cl/servicios/v1/publico";
const MP_TICKET = process.env.MERCADO_PUBLICO_TICKET || "";

const UNAVAILABLE = { error: "Servicio de Mercado Público temporalmente no disponible" };

export const mercadopublicoRouter = Router();

mercadopublicoRouter.get("/licitaciones.json", async (req, res) => {
  try {
    if (!MP_TICKET) {
      res.status(503).json(UNAVAILABLE);
      return;
    }

    const url = new URL(`${MP_BASE}${req.url}`);
    url.searchParams.set("ticket", MP_TICKET);

    const upstream = await fetch(url.toString(), { signal: AbortSignal.timeout(15000) });
    const body = Buffer.from(await upstream.arrayBuffer());
    res.status(upstream.status).set("Content-Type", upstream.headers.get("content-type") || "application/json").send(body);
  } catch (error) {
    console.error("Mercado Público proxy error:", error);
    res.status(503).json(UNAVAILABLE);
  }
});

mercadopublicoRouter.use((_req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});