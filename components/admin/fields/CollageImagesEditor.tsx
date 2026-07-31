"use client";

import { useRef } from "react";
import type { CollageImage } from "@/data/schema";
import ImagePicker from "../ImagePicker";

type CollageImagesEditorProps = {
  images: CollageImage[];
  onChange: (images: CollageImage[]) => void;
};

/**
 * El handle de arrastre (⠿) es lo único draggable de cada fila — no la
 * fila entera, porque contiene un ImagePicker (input de texto + botón)
 * y un campo de alt-text con los que hace falta poder interactuar
 * normalmente (tipear, seleccionar texto) sin que el navegador lo
 * confunda con el inicio de un arrastre. Mismo patrón de
 * drag-and-drop que StepImages.tsx (Paso 2 del wizard de creación) —
 * excepción ya aceptada al Non Goal de "no drag-and-drop": es
 * reordenar una lista de fotos, no páginas/bloques del catálogo.
 */
export default function CollageImagesEditor({ images, onChange }: CollageImagesEditorProps) {
  const dragIndexRef = useRef<number | null>(null);

  const update = (i: number, patch: Partial<CollageImage>) => {
    onChange(images.map((img, idx) => (idx === i ? { ...img, ...patch } : img)));
  };
  const remove = (i: number) => onChange(images.filter((_, idx) => idx !== i));
  const add = () => onChange([...images, { src: "/imagenes/base-20260731-c6c17dd3.webp", alt: "" }]);

  const reorder = (from: number, to: number) => {
    if (from === to) return;
    const next = [...images];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  return (
    <div className="admin-field">
      <label>Imágenes del collage</label>
      <div className="admin-list-editor">
        {images.map((img, i) => (
          <div
            className="admin-collage-row"
            key={i}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const from = dragIndexRef.current;
              dragIndexRef.current = null;
              if (from !== null) reorder(from, i);
            }}
          >
            <span
              className="admin-collage-drag-handle"
              draggable
              onDragStart={() => {
                dragIndexRef.current = i;
              }}
              role="button"
              tabIndex={-1}
              aria-label="Arrastrar para reordenar"
              title="Arrastrar para reordenar"
            >
              ⠿
            </span>
            <ImagePicker value={img.src} onChange={(v) => update(i, { src: v })} />
            <input
              type="text"
              placeholder="texto alternativo"
              value={img.alt}
              onChange={(e) => update(i, { alt: e.target.value })}
            />
            <button
              type="button"
              className="admin-btn admin-btn-icon admin-btn-danger"
              onClick={() => remove(i)}
              aria-label="Quitar imagen"
            >
              ✕
            </button>
          </div>
        ))}
        <button type="button" className="admin-btn" onClick={add}>
          + Agregar imagen
        </button>
      </div>
    </div>
  );
}
