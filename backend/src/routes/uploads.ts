import express, { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db } from "../db/index.js";
import { products, productImages, productDocuments, companies, PRODUCT_DOC_TYPES } from "../db/schema.js";
import { eq, asc } from "drizzle-orm";
import { scopeCompanyId } from "../middleware/auth.js";
import { optimizeImage } from "../services/image.js";

const UPLOADS_DIR = path.resolve("uploads");
const IMAGES_DIR = path.join(UPLOADS_DIR, "images");
const PDFS_DIR = path.join(UPLOADS_DIR, "pdfs");
const DOCS_DIR = path.join(UPLOADS_DIR, "docs");
const LOGOS_DIR = path.join(UPLOADS_DIR, "logos");

fs.mkdirSync(IMAGES_DIR, { recursive: true });
fs.mkdirSync(PDFS_DIR, { recursive: true });
fs.mkdirSync(DOCS_DIR, { recursive: true });
fs.mkdirSync(LOGOS_DIR, { recursive: true });

const imageStorage = multer.diskStorage({
  destination: (_req, file, cb) => {
    const productId = _req.params.id;
    const dir = path.join(IMAGES_DIR, String(productId));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, name);
  },
});

const pdfStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, PDFS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `tech-sheet-${Date.now()}${ext}`;
    cb(null, name);
  },
});

const uploadImage = multer({
  storage: imageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|gif/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) {
      cb(null, true);
    } else {
      cb(new Error("Solo se permiten imágenes (jpg, png, webp, gif)"));
    }
  },
});

const docStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, DOCS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});

const uploadPdf = multer({
  storage: pdfStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Solo se permiten archivos PDF"));
    }
  },
});

const logoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, LOGOS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `logo-${Date.now()}${ext}`);
  },
});

const uploadLogo = multer({
  storage: logoStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|gif/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) {
      cb(null, true);
    } else {
      cb(new Error("Solo se permiten imágenes (jpg, png, webp, gif)"));
    }
  },
});

export const uploadsRouter = Router();

uploadsRouter.post("/company-logo", uploadLogo.single("logo"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No se envió un archivo de logo" });
      return;
    }

    // El vendedor sube el logo de su propia empresa; el admin puede indicar
    // companyId en el body (para el logo de otro vendedor).
    let companyId = scopeCompanyId(req.auth);
    if (companyId === null) {
      companyId = Number(req.body.companyId) || null;
    }
    if (!companyId) {
      fs.unlinkSync(file.path);
      res.status(400).json({ error: "No se pudo determinar la empresa del logo" });
      return;
    }

    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (!company) {
      fs.unlinkSync(file.path);
      res.status(404).json({ error: "Empresa no encontrada" });
      return;
    }

    // Borrar el logo anterior si vivía en uploads para no dejar archivos huérfanos.
    if (company.logoUrl?.startsWith("/uploads/logos/")) {
      const prevPath = path.resolve(company.logoUrl.slice(1));
      if (fs.existsSync(prevPath)) {
        try {
          fs.unlinkSync(prevPath);
        } catch {
          // si falla el borrado no bloquea la actualización
        }
      }
    }

    // Optimizar el logo (máx. 512px, WebP) manteniendo la URI ya registrada.
    const logoFilename = await optimizeImage(file.path, 512, 85);
    const optimizedLogoUrl = `/uploads/logos/${logoFilename}`;

    const [updated] = await db
      .update(companies)
      .set({ logoUrl: optimizedLogoUrl, updatedAt: new Date() })
      .where(eq(companies.id, companyId))
      .returning();

    res.json({ logoUrl: updated.logoUrl });
  } catch (error) {
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch { /* noop */ }
    }
    console.error("POST /uploads/company-logo error:", error);
    res.status(500).json({ error: "Error al subir el logo" });
  }
});

uploadsRouter.post("/:id/images", uploadImage.array("images", 10), async (req, res) => {
  try {
    const productId = Number(req.params.id);
    const [product] = await db.select().from(products).where(eq(products.id, productId));
    if (!product) {
      res.status(404).json({ error: "Producto no encontrado" });
      return;
    }

    const files = req.files as Express.Multer.File[];
    if (!files?.length) {
      res.status(400).json({ error: "No se enviaron imágenes" });
      return;
    }

    const existingImages = await db.select().from(productImages).where(eq(productImages.productId, productId));
    const maxOrder = existingImages.reduce((max, img) => Math.max(max, img.sortOrder ?? 0), 0);

    // Optimizar cada archivo (re-dimensionar + WebP) y borrar el original.
    const optimized: Array<{ file: Express.Multer.File; filename: string }> = [];
    for (const file of files) {
      try {
        const filename = await optimizeImage(file.path, 1200, 82);
        optimized.push({ file, filename });
      } catch {
        try { fs.unlinkSync(file.path); } catch { /* noop */ }
      }
    }
    if (optimized.length === 0) {
      res.status(400).json({ error: "No se pudo procesar ninguna imagen" });
      return;
    }

    const inserted = await db.insert(productImages).values(
      optimized.map(({ file, filename }, i) => ({
        productId,
        url: `/uploads/images/${productId}/${filename}`,
        alt: file.originalname,
        sortOrder: maxOrder + i + 1,
      }))
    ).returning();

    res.status(201).json(inserted);
  } catch (error) {
    console.error("POST /uploads/:id/images error:", error);
    res.status(500).json({ error: "Error subiendo imágenes" });
  }
});

uploadsRouter.delete("/:id/images/:imageId", async (req, res) => {
  try {
    const imageId = Number(req.params.imageId);
    const [image] = await db.select().from(productImages).where(eq(productImages.id, imageId));
    if (!image) {
      res.status(404).json({ error: "Imagen no encontrada" });
      return;
    }

    const filePath = path.resolve(image.url.slice(1));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await db.delete(productImages).where(eq(productImages.id, imageId));
    res.json({ message: "Imagen eliminada" });
  } catch (error) {
    console.error("DELETE /uploads/:id/images/:imageId error:", error);
    res.status(500).json({ error: "Error eliminando imagen" });
  }
});

uploadsRouter.post("/:id/technical-sheet", uploadPdf.single("pdf"), async (req, res) => {
  try {
    const productId = Number(req.params.id);
    const [product] = await db.select().from(products).where(eq(products.id, productId));
    if (!product) {
      res.status(404).json({ error: "Producto no encontrado" });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: "No se envió ningún PDF" });
      return;
    }

    if (product.technicalSheetUrl) {
      const oldPath = path.resolve(product.technicalSheetUrl.slice(1));
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    const pdfUrl = `/uploads/pdfs/${req.file.filename}`;

    await db.update(products).set({ technicalSheetUrl: pdfUrl, updatedAt: new Date() }).where(eq(products.id, productId));

    res.status(201).json({ url: pdfUrl });
  } catch (error) {
    console.error("POST /uploads/:id/technical-sheet error:", error);
    res.status(500).json({ error: "Error subiendo ficha técnica" });
  }
});

uploadsRouter.delete("/:id/technical-sheet", async (req, res) => {
  try {
    const productId = Number(req.params.id);
    const [product] = await db.select().from(products).where(eq(products.id, productId));
    if (!product) {
      res.status(404).json({ error: "Producto no encontrado" });
      return;
    }

    if (product.technicalSheetUrl) {
      const filePath = path.resolve(product.technicalSheetUrl.slice(1));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      await db.update(products).set({ technicalSheetUrl: null, updatedAt: new Date() }).where(eq(products.id, productId));
    }

    res.json({ message: "Ficha técnica eliminada" });
  } catch (error) {
    console.error("DELETE /uploads/:id/technical-sheet error:", error);
    res.status(500).json({ error: "Error eliminando ficha técnica" });
  }
});

// ─── DOCUMENTOS ADJUNTOS (hojas de seguridad, manuales, fichas) ─────
// A diferencia de la ficha técnica principal, un producto puede acumular
// varios PDFs y cada uno tiene su tipo y título.

const uploadDoc = multer({
  storage: docStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Solo se permiten archivos PDF"));
    }
  },
});

uploadsRouter.post("/:id/documents", uploadDoc.array("files", 10), async (req, res) => {
  try {
    const productId = Number(req.params.id);
    const [product] = await db.select().from(products).where(eq(products.id, productId));
    if (!product) {
      res.status(404).json({ error: "Producto no encontrado" });
      return;
    }

    const files = req.files as Express.Multer.File[];
    if (!files?.length) {
      res.status(400).json({ error: "No se enviaron archivos" });
      return;
    }

    const rawType = String(req.body.docType || "otro");
    if (!PRODUCT_DOC_TYPES.includes(rawType as (typeof PRODUCT_DOC_TYPES)[number])) {
      for (const file of files) {
        fs.unlinkSync(file.path);
      }
      res.status(400).json({ error: "Tipo de documento no válido" });
      return;
    }

    const customTitle = String(req.body.title || "").trim();

    const inserted = await db
      .insert(productDocuments)
      .values(
        files.map((file) => ({
          productId,
          docType: rawType,
          title: customTitle || file.originalname,
          fileUrl: `/uploads/docs/${file.filename}`,
          fileName: file.originalname,
          fileSize: file.size,
        }))
      )
      .returning();

    res.status(201).json(inserted);
  } catch (error) {
    console.error("POST /uploads/:id/documents error:", error);
    res.status(500).json({ error: "Error subiendo documentos" });
  }
});

uploadsRouter.get("/:id/documents", async (req, res) => {
  try {
    const productId = Number(req.params.id);
    const docs = await db
      .select()
      .from(productDocuments)
      .where(eq(productDocuments.productId, productId))
      .orderBy(asc(productDocuments.createdAt));
    res.json(docs);
  } catch (error) {
    console.error("GET /uploads/:id/documents error:", error);
    res.status(500).json({ error: "Error obteniendo documentos" });
  }
});

uploadsRouter.delete("/:id/documents/:docId", async (req, res) => {
  try {
    const docId = Number(req.params.docId);
    const [doc] = await db.select().from(productDocuments).where(eq(productDocuments.id, docId));
    if (!doc) {
      res.status(404).json({ error: "Documento no encontrado" });
      return;
    }

    const filePath = path.resolve(doc.fileUrl.slice(1));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    await db.delete(productDocuments).where(eq(productDocuments.id, docId));
    res.json({ message: "Documento eliminado" });
  } catch (error) {
    console.error("DELETE /uploads/:id/documents/:docId error:", error);
    res.status(500).json({ error: "Error eliminando documento" });
  }
});

uploadsRouter.get("/:id/images", async (req, res) => {
  try {
    const productId = Number(req.params.id);
    const images = await db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, productId))
      .orderBy(asc(productImages.sortOrder));
    res.json(images);
  } catch (error) {
    console.error("GET /uploads/:id/images error:", error);
    res.status(500).json({ error: "Error obteniendo imágenes" });
  }
});

uploadsRouter.use((err: Error & { code?: string }, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.message?.includes("Solo se permiten")) {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err.code === "LIMIT_FILE_SIZE") {
    res.status(400).json({ error: "El archivo excede el tamaño máximo permitido" });
    return;
  }
  next(err);
});
