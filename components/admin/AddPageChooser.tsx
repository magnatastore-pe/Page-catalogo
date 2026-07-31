"use client";

import { useState } from "react";
import type { Block } from "@/data/schema";
import AddColorwayForm from "./AddColorwayForm";

/** Tipos de página que se pueden agregar de a una. Se exporta para que
 *  el editor y el asistente de creación no mantengan su propia copia de
 *  esta lista — tenerla duplicada fue lo que los desincronizó al sumar
 *  "Detalle" y "Portadilla". */
export type SingleType = "manifesto" | "productHero" | "closing" | "chapterHero" | "productDetail";

/**
 * "Agregar colorway" sigue siendo el camino recomendado (arma el par
 * capítulo + detalle ya vinculados), pero antes era el ÚNICO modo de
 * agregar esas dos páginas: no se podía sumar solo una de detalle ni
 * solo una de portadilla. Ahora también están sueltas, con etiquetas
 * que dicen qué es cada una en vez del nombre técnico del bloque.
 *
 * Una página de detalle agregada sola queda con el identificador vacío,
 * así que no se agrupa con ninguna portadilla — es una página
 * independiente, que es justo lo que se quiere al agregarla por
 * separado.
 */
export const SINGLE_TYPES: { type: SingleType; label: string; icon: string }[] = [
  { type: "productDetail", label: "Detalle (precio y fotos)", icon: "🏷️" },
  { type: "chapterHero", label: "Portadilla (foto de fondo)", icon: "🌄" },
  { type: "manifesto", label: "Manifiesto", icon: "📝" },
  { type: "productHero", label: "Hero de producto", icon: "🖼️" },
  { type: "closing", label: "Cierre", icon: "🏁" },
];

type AddPageChooserProps = {
  defaultProductName: string;
  defaultProductType: string;
  onAddColorway: (blocks: [Block, Block]) => void;
  onAddSingle: (type: SingleType) => void;
};

/**
 * Reemplaza el <select> con los 6 tipos de bloque como texto plano por
 * una elección visual: "+ Colorway" como acción grande y primaria (el
 * caso común — un catálogo típico agrega colorways mucho más seguido
 * que cualquier otro tipo de página), y el resto como botones chicos
 * secundarios. El formulario de colorway en sí (AddColorwayForm) no
 * cambia — esto solo decide cuándo mostrarlo.
 */
export default function AddPageChooser({
  defaultProductName,
  defaultProductType,
  onAddColorway,
  onAddSingle,
}: AddPageChooserProps) {
  const [showColorwayForm, setShowColorwayForm] = useState(false);

  return (
    <div className="admin-add-page-chooser">
      <p className="admin-page-group-label">Agregar página</p>

      {showColorwayForm ? (
        <div className="admin-add-colorway-wrap">
          <button
            type="button"
            className="admin-btn admin-btn-icon"
            onClick={() => setShowColorwayForm(false)}
            aria-label="Cancelar"
          >
            ✕
          </button>
          <AddColorwayForm
            defaultProductName={defaultProductName}
            defaultProductType={defaultProductType}
            onAdd={(blocks) => {
              onAddColorway(blocks);
              setShowColorwayForm(false);
            }}
          />
        </div>
      ) : (
        <button type="button" className="admin-add-page-primary" onClick={() => setShowColorwayForm(true)}>
          <span className="admin-add-page-primary-icon">+</span>
          <span className="admin-add-page-primary-text">
            <strong>Colorway</strong>
            <small>Capítulo + detalle vinculados — lo más común</small>
          </span>
        </button>
      )}

      <div className="admin-add-page-secondary">
        {SINGLE_TYPES.map((t) => (
          <button
            key={t.type}
            type="button"
            className="admin-add-page-secondary-btn"
            onClick={() => onAddSingle(t.type)}
          >
            <span aria-hidden="true">{t.icon}</span> {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Etiqueta legible de cada tipo, derivada de la misma lista de arriba. */
export const SINGLE_TYPE_LABELS = Object.fromEntries(
  SINGLE_TYPES.map((t) => [t.type, t.label])
) as Record<SingleType, string>;
