export const ROLES = ["admin", "empresa", "cotizador"] as const;

export type Role = (typeof ROLES)[number];

export const DEFAULT_ROLE: Role = "cotizador";

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function toRole(value: unknown): Role {
  return isRole(value) ? value : DEFAULT_ROLE;
}

export function isAdmin(role: string | null | undefined): boolean {
  return role === "admin";
}