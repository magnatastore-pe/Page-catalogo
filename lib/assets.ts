import "server-only";
import { createHash } from "node:crypto";
import { put, list as listBlobs, del as delBlob } from "@vercel/blob";
import { commitFile, commitFiles } from "./github";
import { catalogs } from "@/data/catalogs";
import { slugify } from "./slug";
import { CATALOG_TEMPLATES } from "./newCatalog";

const ASSETS_SUBDIR = "imagenes"; // relativo a public/
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export type Asset = {
  path: string; // ej. "/imagenes/foto.jpg" (fotos viejas, en el repo) o una URL de Vercel Blob (fotos nuevas) — listo para usar en un campo del catálogo
  filename: string;
};

function isBlobUrl(assetPath: string): boolean {
  return assetPath.startsWith("http://") || assetPath.startsWith("https://");
}

/**
 * La biblioteca del panel muestra SOLO las fotos subidas (las que viven
 * en Vercel Blob), no las que vienen dentro del repositorio.
 *
 * Las de `public/imagenes/` son las fotos de muestra de las 10
 * plantillas: existen para que un catálogo recién creado se vea como un
 * catálogo de verdad, no para que nadie las elija a mano. Listarlas
 * llenaba la ventana de "Elegir imagen" con decenas de fotos ajenas al
 * negocio, y encima entre ellas las propias — que es justo lo que se
 * pidió sacar.
 *
 * Esto es solo la lista del panel: las plantillas siguen usando esas
 * rutas y se siguen sirviendo igual, así que un catálogo creado desde
 * una plantilla no cambia en nada. Y como el campo de cada imagen
 * también acepta una ruta escrita a mano, ninguna queda inaccesible.
 *
 * Una foto recién subida aparece al instante (Blob no necesita
 * redeploy), y el picker igual la agrega a su estado apenas se
 * confirma la subida.
 */
export async function listAssets(): Promise<Asset[]> {
  const blobs = await listBlobs({ prefix: `${ASSETS_SUBDIR}/` })
    .then((r) => r.blobs)
    .catch(() => []);

  return blobs
    .map((b) => ({
      filename: b.pathname.split("/").pop() ?? b.pathname,
      path: b.url,
    }))
    .filter((asset) => ALLOWED_EXTENSIONS.has(extensionOf(asset.filename)))
    .sort((a, b) => a.filename.localeCompare(b.filename));
}

function extensionOf(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}


/**
 * Todas las rutas de imagen que algún catálogo está usando ahora mismo.
 *
 * Recorre el registro entero juntando **cualquier** string, en vez de
 * leer campo por campo (`bgImage`, `collageImages[].src`,
 * `swatches[].image`). Es a propósito: enumerar los campos obliga a
 * acordarse de actualizar esto cada vez que el schema gane un campo de
 * imagen nuevo, y olvidarse acá no rompe nada visible — simplemente
 * marcaría como "sin usar" una foto que sí se usa, y alguien la
 * borraría. Recolectar todo y filtrar por coincidencia exacta con el
 * path del asset es más burdo pero no puede quedar desactualizado.
 */
export function listUsedAssetPaths(): Set<string> {
  const used = new Set<string>();

  const walk = (value: unknown): void => {
    if (typeof value === "string") {
      used.add(value);
    } else if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (value && typeof value === "object") {
      Object.values(value).forEach(walk);
    }
  };

  walk(catalogs);

  // Las fotos de las plantillas de arranque también cuentan como "en
  // uso", aunque ningún catálogo publicado las referencie: son las que
  // rellenan un catálogo recién creado desde el wizard. Sin esto la
  // galería las marcaba a todas como huérfanas (40 de 55 en el estado
  // actual del repo) y borrarlas dejaba el wizard generando catálogos
  // con imágenes rotas.
  //
  // `build()` se ejecuta con valores de relleno porque los paths de
  // foto que devuelve son fijos, no dependen del nombre ni del año.
  for (const template of CATALOG_TEMPLATES) {
    walk(template.preview);
    try {
      walk(template.build("x", "x", "2026"));
    } catch {
      // Una plantilla rota no debe impedir listar el resto; en el peor
      // caso sus fotos aparecen como huérfanas, que es el lado seguro
      // (se muestran de más, no se borran de más).
    }
  }

  return used;
}

export type DeleteAssetResult = { ok: true } | { ok: false; error: string };

/**
 * Borra una imagen de donde sea que viva: Vercel Blob (fotos nuevas) o
 * el repo (fotos anteriores al cambio a Blob).
 *
 * Se niega si algún catálogo la está usando. Podría hacerse al revés
 * (borrar igual y avisar), pero el costo de los dos errores no es
 * simétrico: dejar una foto de más solo ocupa espacio, mientras que
 * borrar una en uso rompe una página del catálogo publicado y la foto
 * no se recupera. La galería ya marca cuáles están sin usar, así que
 * esta validación no debería sorprender a nadie — es la red por si la
 * lista que ve el panel quedó vieja respecto al último deploy.
 */
export async function deleteAsset(assetPath: string): Promise<DeleteAssetResult> {
  if (listUsedAssetPaths().has(assetPath)) {
    return { ok: false, error: "Esa imagen está en uso en un catálogo. Sacala de ahí antes de borrarla." };
  }

  try {
    if (isBlobUrl(assetPath)) {
      await delBlob(assetPath);
      return { ok: true };
    }

    if (!assetPath.startsWith(`/${ASSETS_SUBDIR}/`) || assetPath.includes("..")) {
      return { ok: false, error: "Ruta de imagen inválida." };
    }

    await commitFiles(
      [{ path: `public${assetPath}`, base64Content: null }],
      `assets: eliminar ${assetPath} desde el panel de administración`
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error desconocido al borrar la imagen." };
  }
}

/**
 * Nombre con el que se guarda una foto: `<catálogo>-<fecha>-<hash>.<ext>`
 * (ej. `ariel-20260731-3f9a1c2b.webp`).
 *
 * Reemplaza al "nombre original saneado + sufijo aleatorio si choca".
 * Tres motivos concretos, todos salidos del uso real:
 *
 * - El nombre original casi nunca dice nada (`IMG_4821.JPG`, `2.png`) y
 *   encima se repite entre tandas distintas.
 * - El sufijo aleatorio para desempatar producía nombres feos y, peor,
 *   duplicaba en la base la MISMA foto subida dos veces.
 * - El hash es del contenido, así que dos subidas idénticas caen en el
 *   mismo nombre y la segunda ni siquiera se sube: se reusa la primera.
 *
 * La fecha es de subida, no del archivo: sirve para ordenar y para
 * reconocer de un vistazo qué entró en qué momento.
 */
function buildAssetName(catalogId: string | undefined, bytes: Buffer, ext: string): string {
  const prefix = slugify(catalogId ?? "") || "catalogo";
  const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const hash = createHash("sha1").update(bytes).digest("hex").slice(0, 8);
  return `${prefix}-${fecha}-${hash}.${ext}`;
}

export type UploadAssetResult =
  | { ok: true; path: string; commitUrl: string }
  | { ok: false; error: string };

/**
 * Sube una imagen nueva a Vercel Blob (fix de velocidad — antes
 * comiteaba a GitHub, lo que significaba esperar un commit real por
 * cada foto; Blob la deja disponible al instante). Nunca pisa un
 * archivo existente: si el nombre saneado ya está en uso, le agrega un
 * sufijo corto en vez de sobreescribir la foto de otra colorway por
 * coincidencia de nombre. El texto del catálogo (nombres, precios,
 * descripciones) sigue yendo a GitHub como siempre — esto solo cambia
 * dónde viven las fotos.
 */
export async function uploadAsset(
  originalFilename: string,
  base64Content: string,
  catalogId?: string
): Promise<UploadAssetResult> {
  const ext = extensionOf(originalFilename);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      error: `Formato no soportado: .${ext || "?"}. Usá jpg, png, webp o gif.`,
    };
  }

  const bytes = Buffer.from(base64Content, "base64");
  const filename = buildAssetName(catalogId, bytes, ext);
  try {
    // Mismo contenido = mismo nombre = mismo archivo. Subir dos veces la
    // misma foto ya no deja dos copias en la base (antes se le agregaba
    // un sufijo aleatorio y quedaban duplicadas); se reusa la que ya
    // está, sin volver a subir nada.
    const yaEsta = (await listAssets()).find((a) => a.filename === filename);
    if (yaEsta) return { ok: true, path: yaEsta.path, commitUrl: "" };

    const blob = await put(`${ASSETS_SUBDIR}/${filename}`, bytes, {
      access: "public",
      contentType: EXT_TO_MIME[ext],
      addRandomSuffix: false,
    });

    return { ok: true, path: blob.url, commitUrl: "" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error desconocido al subir la imagen." };
  }
}

/**
 * Re-sube el contenido de una imagen que ya existe, a la misma ruta
 * (overwrite intencional) — usado por el re-sync manual de Drive (ver
 * lib/driveLinks.ts). Si la imagen ya vive en Blob (subida después del
 * fix de velocidad), la reemplaza ahí mismo; si todavía es una foto
 * vieja comiteada a GitHub (de antes del fix), sigue el camino
 * original — un asset viejo nunca migra solo, pero re-sincronizarlo no
 * se rompe por eso.
 */
export async function replaceAsset(assetPath: string, base64Content: string): Promise<UploadAssetResult> {
  const ext = extensionOf(assetPath);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, error: `Formato no soportado: .${ext || "?"}. Usá jpg, png, webp o gif.` };
  }

  // `assetPath` llega desde el cliente (app/api/admin/upload/route.ts lo
  // lee del FormData), así que nunca se usa tal cual — mismo criterio
  // que createCatalog aplica a su `id` con slugify(). Sin esto, un path
  // de "/../../algo.png" escribía fuera de public/imagenes/ en el repo
  // real, y una URL arbitraria pisaba cualquier pathname del Blob store
  // (auditoría 2026-07-30, S2).
  //
  // La condición correcta no es "parece una ruta válida" sino "es un
  // asset que ya existe": reemplazar presupone algo que reemplazar.
  const known = await listAssets().catch(() => [] as Asset[]);
  if (!known.some((a) => a.path === assetPath)) {
    return { ok: false, error: "La imagen a reemplazar no existe en la biblioteca." };
  }

  try {
    if (isBlobUrl(assetPath)) {
      const blobPathname = new URL(assetPath).pathname.replace(/^\//, "");
      const blob = await put(blobPathname, Buffer.from(base64Content, "base64"), {
        access: "public",
        contentType: EXT_TO_MIME[ext],
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      return { ok: true, path: blob.url, commitUrl: "" };
    }

    const { commitUrl } = await commitFile(
      `public${assetPath}`,
      base64Content,
      `assets: actualizar ${assetPath} desde Google Drive`
    );
    return { ok: true, path: assetPath, commitUrl };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error desconocido al actualizar la imagen." };
  }
}
