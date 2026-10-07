export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Valida un RUT chileno y devuelve su forma canónica "12345678-5".
 * Acepta "12.345.678-5", "12345678-5" y "123456785" como entrada.
 */
export function normalizeRut(input: string): string | null {
  const clean = input.replace(/[^0-9kK]/g, "").toUpperCase();
  if (clean.length < 8 || clean.length > 9) return null;

  const body = clean.slice(0, -1);
  const check = clean.slice(-1);
  if (!/^\d{7,8}$/.test(body)) return null;

  // Dígito verificador: se recorren los dígitos de derecha a izquierda con
  // factores ciclicos 2,3,4,5,6,7 y se compara 11 - (suma % 11).
  let sum = 0;
  let factor = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const remainder = 11 - (sum % 11);
  const expected = remainder === 11 ? "0" : remainder === 10 ? "K" : String(remainder);
  if (expected !== check) return null;

  return `${body}-${check}`;
}

export function isValidRut(input: string): boolean {
  return normalizeRut(input) !== null;
}