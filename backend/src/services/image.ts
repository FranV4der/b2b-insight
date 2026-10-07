import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

/**
 * Optimiza una imagen subida: la redimensiona (máx. `maxSize` px, sin ampliar)
 * y la re-codifica a WebP. Borra el archivo original y devuelve el nuevo
 * nombre de archivo (la URL guardada pasa a apuntar al `.webp`).
 */
export async function optimizeImage(
  filePath: string,
  maxSize = 1200,
  quality = 82
): Promise<string> {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  const outFile = path.join(dir, `${base}.webp`);

  await sharp(filePath)
    .resize({ width: maxSize, height: maxSize, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .webp({ quality, effort: 6 })
    .toFile(outFile);

  if (fs.existsSync(filePath) && outFile !== filePath) {
    fs.unlinkSync(filePath);
  }
  return `${base}.webp`;
}