import "dotenv/config";
import fs from "fs";
import http from "http";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import { productsRouter } from "./routes/products.js";
import { categoriesRouter } from "./routes/categories.js";
import { brandsRouter } from "./routes/brands.js";
import { importRouter } from "./routes/import.js";
import { uploadsRouter } from "./routes/uploads.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { quotesRouter } from "./routes/quotes.js";
import { priceListsRouter } from "./routes/priceLists.js";
import { companiesRouter } from "./routes/companies.js";
import { customersRouter } from "./routes/customers.js";
import { ordersRouter } from "./routes/orders.js";
import { notificationsRouter } from "./routes/notifications.js";
import { mercadopublicoRouter } from "./routes/mercadopublico.js";
import { requireAuth, requireEmpresa } from "./middleware/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(helmet());

const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 10 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Intenta de nuevo en 15 minutos." },
});

const globalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas peticiones. Intenta de nuevo más tarde." },
});

app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use(globalLimiter);

app.use("/api/auth", authLimiter, authRouter);

app.use("/api/products", productsRouter);
app.use("/api/products", requireAuth, requireEmpresa, importRouter);

app.use("/api/categories", categoriesRouter);
app.use("/api/brands", brandsRouter);
app.use("/api/uploads", requireAuth, requireEmpresa, uploadsRouter);

app.use("/api/users", usersRouter);
app.use("/api/quotes", quotesRouter);
app.use("/api/price-lists", priceListsRouter);
app.use("/api/companies", companiesRouter);
app.use("/api/customers", customersRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/mp", mercadopublicoRouter);

// Las rutas de API responden JSON también en 404 y 500: nunca HTML, para que el
// cliente no reviente al hacer response.json().
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

app.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
  console.error("Unhandled error:", err);
  if (res.headersSent) {
    next(err);
    return;
  }
  res.status(500).json({ error: "Error interno del servidor" });
});

const server = http.createServer(app);
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log("[boot] cwd =", process.cwd());
  console.log("[boot] dist dir =", __dirname);
  console.log("[boot] uploads (dist+../) =", path.join(__dirname, "..", "uploads"));
  console.log("[boot] uploads (cwd) =", path.resolve("uploads"));
  console.log("[boot] RAILWAY_VOLUME_MOUNT_PATH =", process.env.RAILWAY_VOLUME_MOUNT_PATH || "(no set)");
  console.log("[boot] uploadsDir exists =", fs.existsSync(path.join(__dirname, "..", "uploads")));
  console.log("[boot] cwd/uploads exists =", fs.existsSync(path.resolve("uploads")));
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err);
});
