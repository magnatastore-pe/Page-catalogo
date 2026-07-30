import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { uploadAsset, replaceAsset } from "@/lib/assets";

/**
 * Route Handler para subir imágenes — no un Server Action (fix,
 * 2026-07-28). El panel pasaba el contenido de la imagen en base64 como
 * argumento de un Server Action; a partir de ~3MB (fotos reales de
 * Drive sin optimizar, a diferencia de las ya comprimidas en
 * public/imagenes/) eso choca con un límite interno de seguridad de
 * React ("Maximum array nesting exceeded") mucho antes del límite de
 * 8mb ya configurado — un Route Handler lee el archivo directo del
 * multipart/form-data, sin pasar por la serialización de Server
 * Actions, así que ese límite no aplica acá.
 */
/**
 * Tope duro de tamaño (auditoría 2026-07-30, S3). lib/imageCompression.ts
 * ya reduce las fotos antes de subirlas, pero eso corre en el navegador:
 * un POST directo con curl se lo saltea entero. Sin este límite, el
 * archivo se cargaba completo a memoria y después se duplicaba +33% al
 * pasarlo a base64 — con los 100MB de body que acepta Vercel, una sola
 * petición podía pedir ~230MB.
 *
 * 12MB es holgado para el caso real: el cliente comprime a 2400px, lo
 * que deja las fotos típicas cerca de 1MB.
 */
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

function tooLarge(bytes: number) {
  return NextResponse.json(
    {
      ok: false,
      error: `La imagen pesa ${(bytes / 1024 / 1024).toFixed(1)}MB y el máximo es ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.`,
    },
    { status: 413 }
  );
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  // Se corta por Content-Length antes de tocar el body: rechazar recién
  // después de haberlo leído entero no evitaría el costo que se quiere
  // evitar. El chequeo sobre file.size de más abajo es el respaldo para
  // cuando la cabecera falta o miente.
  const declaredSize = Number(request.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_UPLOAD_BYTES) {
    return tooLarge(declaredSize);
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Falta el archivo a subir." }, { status: 400 });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return tooLarge(file.size);
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  const mode = formData.get("mode");
  const targetPath = formData.get("path");

  const result =
    mode === "replace" && typeof targetPath === "string"
      ? await replaceAsset(targetPath, base64)
      : await uploadAsset(file.name, base64);

  return NextResponse.json(result);
}
