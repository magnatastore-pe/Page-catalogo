import type { UploadAssetResult } from "./assets";
import { compressImage } from "./imageCompression";

/**
 * Sube un archivo real (File o Blob) vía el Route Handler de subida
 * (app/api/admin/upload/route.ts) — no un Server Action (fix,
 * 2026-07-28: ver la nota en ese archivo). Un solo punto de llamada
 * compartido entre ImagePicker y StepImages, en vez de repetir el
 * armado de FormData en cada uno. Comprime antes de subir (fix,
 * 2026-07-29) — el commit a GitHub tarda menos si viajan menos bytes,
 * en vez de esperar a que la red/GitHub procesen el archivo original
 * completo.
 */
export async function uploadFile(file: File, catalogId?: string): Promise<UploadAssetResult> {
  const compressed = await compressImage(file, file.name);
  const formData = new FormData();
  formData.append("file", compressed);
  // Con qué catálogo se nombra el archivo guardado (ver buildAssetName
  // en lib/assets.ts). Opcional: sin esto el prefijo es "catalogo".
  if (catalogId) formData.append("catalogId", catalogId);
  return post(formData, file.name);
}

/**
 * Nunca lanza: cualquier fallo vuelve como `{ ok: false, error }` con
 * algo que se pueda leer.
 *
 * `res.json()` a secas revienta cuando la respuesta no es JSON — un 413
 * de la plataforma, un 502, la página de error de Next — y eso hacía
 * que subir varias fotos de una cortara la tanda entera con un
 * "no se pudo subir una de las imágenes" que no decía ni cuál ni por
 * qué. Ahora el error identifica el archivo y trae el código real.
 */
async function post(formData: FormData, filename: string): Promise<UploadAssetResult> {
  let res: Response;
  try {
    res = await fetch("/api/admin/upload", { method: "POST", body: formData });
  } catch {
    return { ok: false, error: `"${filename}": se cortó la conexión durante la subida.` };
  }

  const raw = await res.text().catch(() => "");
  try {
    const parsed = JSON.parse(raw) as UploadAssetResult;
    if (!parsed.ok) return { ...parsed, error: `"${filename}": ${parsed.error}` };
    return parsed;
  } catch {
    return {
      ok: false,
      error: `"${filename}": el servidor respondió ${res.status}${raw ? ` (${raw.slice(0, 120)})` : ""}.`,
    };
  }
}

/** Igual, pero reemplaza el contenido de un asset ya existente en `path` (re-sync de Drive, Fase F). */
export async function replaceFile(path: string, blob: Blob, filename: string): Promise<UploadAssetResult> {
  const compressed = await compressImage(blob, filename);
  const formData = new FormData();
  formData.append("file", compressed);
  formData.append("mode", "replace");
  formData.append("path", path);
  return post(formData, filename);
}
