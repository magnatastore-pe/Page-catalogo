import type { Block } from "@/data/schema";

export type CompletenessResult = { ok: boolean; missing: string[] };

/**
 * Chequeo de completitud puramente informativo — nunca bloquea Guardar
 * (el usuario confirmó: avisar sí, impedir no). Solo marca campos que
 * son inequívocamente "vacíos" (string vacío, arrays sin elementos) —
 * a propósito NO intenta adivinar si una imagen de fondo sigue en el
 * placeholder por defecto (`/imagenes/placeholder-20260802-4dbc0b18.webp`), porque esa misma ruta
 * es una foto real y deliberada en más de un catálogo (ej. la portada
 * de Ariel) — no hay forma confiable de distinguir "nunca se tocó" de
 * "el admin eligió justo esa foto", así que un chequeo así generaría
 * falsos positivos sobre contenido real y le restaría confianza al
 * aviso.
 */
export function checkCompleteness(block: Block): CompletenessResult {
  const missing: string[] = [];

  switch (block.type) {
    case "cover":
      if (!block.data.title.trim()) missing.push("título");
      break;
    case "manifesto":
      if (!block.data.heading.trim()) missing.push("título");
      if (!block.data.paragraph.trim()) missing.push("párrafo");
      break;
    case "productHero":
      if (!block.data.name.trim()) missing.push("nombre");
      break;
    case "chapterHero":
      if (!block.data.name.trim() && !block.data.label.trim()) missing.push("nombre");
      break;
    case "productDetail":
      if (!block.data.name.trim()) missing.push("nombre");
      if (!block.data.price.trim()) missing.push("precio");
      if (block.data.collageImages.length === 0) missing.push("fotos");
      if (block.data.swatches.length === 0) missing.push("colores");
      break;
    case "closing":
      if (!block.data.title.trim()) missing.push("título");
      break;
  }

  return { ok: missing.length === 0, missing };
}

/** Para una tarjeta de colorway (capítulo + detalle) — une lo que falte de cualquiera de los dos, sin repetir. */
export function checkColorwayCompleteness(chapter: Block, detail: Block): CompletenessResult {
  const a = checkCompleteness(chapter);
  const b = checkCompleteness(detail);
  const missing = Array.from(new Set([...a.missing, ...b.missing]));
  return { ok: missing.length === 0, missing };
}
