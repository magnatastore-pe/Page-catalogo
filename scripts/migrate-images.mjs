/**
 * Migración de las fotos ya existentes al formato/nombre nuevos
 * (2026-07-31).
 *
 * Desde este cambio, TODA foto que entra por el panel se guarda como
 * WebP y con el nombre `<catálogo>-<fecha>-<hash>.webp`. Las que ya
 * estaban quedaron con su formato y su nombre viejos: 37MB en
 * `public/imagenes/`, casi todo PNG de varios MB.
 *
 * Qué hace, en orden:
 *  1. Convierte a WebP **todas** las imágenes de `public/imagenes/`
 *     (incluidas las de las subcarpetas de plantilla), con el mismo
 *     tope de 2400px y calidad 0.82 que usa el navegador al subir, para
 *     que una foto vieja y una nueva queden indistinguibles.
 *  2. Reescribe TODAS las referencias del repo: los `data/catalogs/*.json`
 *     y también el código que menciona rutas de imagen — sobre todo
 *     `lib/newCatalog.ts`, donde viven las fotos de arranque de las 10
 *     plantillas.
 *  3. Recién entonces borra los archivos viejos, y solo después de
 *     comprobar que ya no quedó ninguna referencia a ellos en todo el
 *     repositorio.
 *
 * El paso 3 es la razón de que el script haga los tres pasos juntos: un
 * primer intento borraba "lo que ningún catálogo usa" y se llevaba
 * puestas las fotos de arranque de las plantillas, que no las usa
 * ningún catálogo pero sí el código que crea catálogos nuevos.
 *
 * Por qué a `public/` y no a Blob: estas fotos ya viven en el repo y
 * ahí funcionan bien (se sirven del deploy, sin depender de ningún
 * token); moverlas a Blob no aportaría nada y agregaría un paso que
 * puede fallar.
 *
 * Script de una sola vez, para correr a mano
 * (`node scripts/migrate-images.mjs [--dry-run]`) y revisar el
 * resultado con git antes de comitear. NO corre en el build.
 */

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const MAX_DIMENSION = 2400;
const QUALITY = 82;
const ROOT = process.cwd();
const IMAGES_DIR = path.join(ROOT, "public", "imagenes");
const DRY_RUN = process.argv.includes("--dry-run");
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
/** Carpetas donde puede haber referencias a rutas de imagen. */
const SOURCE_DIRS = ["data", "lib", "components", "app", "scripts"];
const SOURCE_EXTENSIONS = new Set([".json", ".ts", ".tsx", ".mjs", ".css"]);

const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, "");

async function walk(dir, files = []) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, files);
    else files.push(full);
  }
  return files;
}

async function sourceFiles() {
  const out = [];
  for (const dir of SOURCE_DIRS) {
    const full = path.join(ROOT, dir);
    try {
      const files = await walk(full);
      out.push(...files.filter((f) => SOURCE_EXTENSIONS.has(path.extname(f))));
    } catch {
      /* la carpeta puede no existir */
    }
  }
  return out;
}

async function main() {
  const all = (await walk(IMAGES_DIR)).filter((f) => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()));
  console.log(`${all.length} imágenes en public/imagenes/\n`);

  /** ruta pública vieja → ruta pública nueva */
  const mapping = new Map();
  let before = 0;
  let after = 0;

  for (const source of all) {
    const rel = path.relative(path.join(ROOT, "public"), source).split(path.sep).join("/");
    const publicPath = `/${rel}`;
    const original = await fs.readFile(source);

    const webp = await sharp(original)
      .rotate() // respeta la orientación EXIF antes de descartarla
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toBuffer();

    if (webp.length >= original.length) {
      console.log(`ya estaba liviana, se deja: ${publicPath}`);
      continue;
    }

    // Prefijo = la subcarpeta de la que viene (que es el nombre de la
    // plantilla), o "base" para las que están sueltas en la raíz, que
    // son el juego compartido entre Ariel y la plantilla Terracota.
    const dirName = path.basename(path.dirname(source));
    const prefix = dirName === "imagenes" ? "base" : dirName;
    const hash = createHash("sha1").update(webp).digest("hex").slice(0, 8);
    const filename = `${prefix}-${fecha}-${hash}.webp`;
    const target = `/imagenes/${filename}`;

    before += original.length;
    after += webp.length;
    console.log(
      `${publicPath} → ${target}   ${(original.length / 1048576).toFixed(2)}MB → ${(webp.length / 1048576).toFixed(2)}MB`
    );

    if (!DRY_RUN) await fs.writeFile(path.join(IMAGES_DIR, filename), webp);
    mapping.set(publicPath, target);
  }

  // --- reescribir referencias ---
  let touchedFiles = 0;
  for (const file of await sourceFiles()) {
    const text = await fs.readFile(file, "utf8");
    let updated = text;
    for (const [oldPath, newPath] of mapping) updated = updated.split(oldPath).join(newPath);
    if (updated !== text) {
      touchedFiles++;
      console.log(`referencias actualizadas: ${path.relative(ROOT, file)}`);
      if (!DRY_RUN) await fs.writeFile(file, updated);
    }
  }

  // --- borrar los viejos, solo si ya no los menciona nadie ---
  const remaining = await sourceFiles();
  const texts = await Promise.all(remaining.map((f) => fs.readFile(f, "utf8")));
  let freed = 0;
  for (const [oldPath] of mapping) {
    const stillReferenced = texts.some((t) => t.includes(oldPath));
    if (stillReferenced) {
      console.warn(`NO se borra (todavía referenciada): ${oldPath}`);
      continue;
    }
    const abs = path.join(ROOT, "public", oldPath.replace(/^\//, ""));
    freed += (await fs.stat(abs)).size;
    if (!DRY_RUN) await fs.unlink(abs);
  }

  // Carpetas de plantilla que quedaron vacías
  if (!DRY_RUN) {
    for (const entry of await fs.readdir(IMAGES_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(IMAGES_DIR, entry.name);
      if ((await fs.readdir(dir)).length === 0) await fs.rmdir(dir);
    }
  }

  console.log("\n--- resumen ---");
  console.log(`convertidas: ${mapping.size} imágenes, ${(before / 1048576).toFixed(1)}MB → ${(after / 1048576).toFixed(1)}MB`);
  console.log(`archivos de código/datos actualizados: ${touchedFiles}`);
  console.log(`espacio liberado al borrar los originales: ${(freed / 1048576).toFixed(1)}MB`);
  if (DRY_RUN) console.log("(--dry-run: no se escribió, reescribió ni borró nada)");
}

main();
