import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required. Set it in your .env file.");
}
const JWT_SECRET: string = process.env.JWT_SECRET;

export interface AuthPayload {
  userId: number;
  email: string;
  role: string;
  /** Vendedor al que pertenece el usuario (role `empresa` / `admin` de plataforma). */
  companyId: number | null;
  /** Comprador al que pertenece el usuario (role `cotizador`). `null` = persona natural. */
  customerId: number | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token de autenticación requerido" });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    req.auth = payload;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido o expirado" });
  }
}

export function getAuthFromRequest(req: Request): AuthPayload | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  try {
    return jwt.verify(header.slice(7), JWT_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

export function isAdminRequest(req: Request): boolean {
  return req.auth?.role === "admin";
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!isAdminRequest(req)) {
    res.status(403).json({ error: "Se requieren permisos de administrador" });
    return;
  }
  next();
}

export function requireEmpresa(req: Request, res: Response, next: NextFunction) {
  if (!req.auth || (req.auth.role !== "empresa" && req.auth.role !== "admin")) {
    res.status(403).json({ error: "Se requieren permisos de empresa" });
    return;
  }
  next();
}

export function requireCotizador(req: Request, res: Response, next: NextFunction) {
  if (!req.auth || (req.auth.role !== "cotizador" && req.auth.role !== "admin")) {
    res.status(403).json({ error: "Se requieren permisos de cotizador" });
    return;
  }
  next();
}

/**
 * companyId efectivo para acotar queries por empresa.
 * El admin de plataforma no pertenece a una empresa, por lo que ve todo:
 * las rutas que usan este valor deben omitir el filtro cuando devuelve null.
 */
export function scopeCompanyId(auth: AuthPayload | null | undefined): number | null {
  if (!auth) return null;
  return auth.role === "admin" ? null : auth.companyId;
}

/**
 * customerId efectivo para acotar queries por comprador.
 * El admin de plataforma no pertenece a un comprador, por lo que ve todo:
 * las rutas que usan este valor deben omitir el filtro cuando devuelve null.
 */
export function scopeCustomerId(auth: AuthPayload | null | undefined): number | null {
  if (!auth) return null;
  return auth.role === "admin" ? null : auth.customerId;
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}
