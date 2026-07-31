/**
 * Compresión client-side antes de subir (fix, 2026-07-29) — feedback
 * real: el commit a GitHub tarda con fotos de Drive sin optimizar
 * (originales de cámara/celular, varios MB a mayor resolución de la
 * que este sitio necesita). Redimensiona/recomprime en el navegador
 * antes de mandar los bytes, así viaja menos y el servidor procesa
 * menos — en vez de "arreglar" la latencia, se ataca la causa real (el
 * tamaño del archivo).
 *
 * Segunda vuelta (fix, 2026-07-31): subir una tanda de 10 fotos
 * fallaba en una con `413 FUNCTION_PAYLOAD_TOO_LARGE`. La causa era el
 * PNG: esta función preservaba el formato de entrada, y un PNG solo se
 * puede achicar por dimensiones — el parámetro de calidad no existe
 * para PNG, y volver a codificarlo desde un canvas suele dar un
 * archivo MÁS grande que el original (el canvas no aplica ninguna de
 * las optimizaciones de paleta que trae un PNG real). O sea: para un
 * PNG grande de dimensiones normales, la compresión no hacía nada y se
 * mandaba el original entero contra el límite de tamaño de petición de
 * la plataforma.
 *
 * Ahora el objetivo no es "achicar un poco" sino "entrar seguro":
 * se prueban calidades/dimensiones cada vez más chicas hasta quedar
 * bajo el tope, y un PNG que no entra se pasa a WebP (que sí tiene
 * calidad regulable y conserva la transparencia). GIF se salta por
 * completo — dibujarlo en un canvas aplanaría la animación a un solo
 * cuadro.
 */

const MAX_DIMENSION = 2400;
const SKIP_COMPRESSION_TYPES = new Set(["image/gif"]);
const COMPRESSION_THRESHOLD_BYTES = 1.5 * 1024 * 1024; // fotos ya chicas no valen la pena tocar

/**
 * Tope al que se apunta. Vercel corta las peticiones a una función
 * bastante antes de los 12MB que acepta el propio Route Handler
 * (`FUNCTION_PAYLOAD_TOO_LARGE`), así que se deja margen holgado: con
 * 3MB de imagen, el multipart completo queda muy por debajo de
 * cualquiera de los dos límites.
 */
const TARGET_MAX_BYTES = 3 * 1024 * 1024;

/**
 * Intentos en orden. El primero es el de siempre (2400px, calidad
 * 0.85); los siguientes solo entran en juego si el resultado todavía
 * no baja del tope — mejor una foto un poco más chica que una subida
 * que falla.
 */
const ATTEMPTS: Array<{ maxDimension: number; quality: number }> = [
  { maxDimension: MAX_DIMENSION, quality: 0.85 },
  { maxDimension: 2000, quality: 0.8 },
  { maxDimension: 1600, quality: 0.72 },
  { maxDimension: 1280, quality: 0.65 },
];

function asFile(blob: Blob, filename: string): File {
  return blob instanceof File ? blob : new File([blob], filename, { type: blob.type });
}

/** Cambia la extensión cuando se cambió el formato (un PNG que salió WebP no puede seguir llamándose .png: el servidor valida por extensión). */
function withExtension(filename: string, mime: string): string {
  const ext = mime === "image/webp" ? "webp" : mime === "image/jpeg" ? "jpg" : null;
  if (!ext) return filename;
  const dot = filename.lastIndexOf(".");
  return `${dot > 0 ? filename.slice(0, dot) : filename}.${ext}`;
}

function encode(
  bitmap: ImageBitmap,
  maxDimension: number,
  type: string,
  quality: number
): Promise<Blob | null> {
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function compressImage(input: Blob, filename: string): Promise<File> {
  if (SKIP_COMPRESSION_TYPES.has(input.type) || input.size < COMPRESSION_THRESHOLD_BYTES) {
    return asFile(input, filename);
  }

  try {
    const bitmap = await createImageBitmap(input);

    // Un PNG grande se pasa a WebP: conserva la transparencia y, a
    // diferencia del PNG, responde al parámetro de calidad. Los demás
    // formatos mantienen el suyo.
    const outputType = input.type === "image/png" ? "image/webp" : input.type || "image/jpeg";

    let best: Blob | null = null;
    for (const attempt of ATTEMPTS) {
      const candidate = await encode(bitmap, attempt.maxDimension, outputType, attempt.quality);
      if (!candidate) break;
      if (!best || candidate.size < best.size) best = candidate;
      if (candidate.size <= TARGET_MAX_BYTES) {
        best = candidate;
        break;
      }
    }
    bitmap.close();

    if (!best) return asFile(input, filename);

    // Quedarse con el original solo si además de ser más chico entra en
    // el tope: si el original se pasa, mandarlo es garantizar el 413
    // que este cambio vino a evitar.
    if (best.size >= input.size && input.size <= TARGET_MAX_BYTES) {
      return asFile(input, filename);
    }

    return new File([best], withExtension(filename, outputType), { type: outputType });
  } catch {
    // Si algo falla al decodificar/comprimir, seguir con el original
    // en vez de bloquear la subida por esto.
    return asFile(input, filename);
  }
}
