"use client";

import type { SwatchItem } from "@/data/schema";
import ImagePicker from "../ImagePicker";

type SwatchesEditorProps = {
  swatches: SwatchItem[];
  onChange: (swatches: SwatchItem[]) => void;
};

export default function SwatchesEditor({ swatches, onChange }: SwatchesEditorProps) {
  const update = (i: number, next: SwatchItem) => {
    onChange(swatches.map((s, idx) => (idx === i ? next : s)));
  };
  const remove = (i: number) => onChange(swatches.filter((_, idx) => idx !== i));
  const add = () => onChange([...swatches, { label: "", type: "image", image: "/imagenes/base-20260731-c6c17dd3.webp" }]);

  const setType = (i: number, type: "image" | "color") => {
    const current = swatches[i];
    if (type === "image") {
      update(i, {
        label: current.label,
        type: "image",
        image: current.type === "image" ? current.image : "/imagenes/base-20260731-c6c17dd3.webp",
      });
    } else {
      update(i, {
        label: current.label,
        type: "color",
        color: current.type === "color" ? current.color : "#cccccc",
      });
    }
  };

  return (
    <div className="admin-field">
      <label>Swatches</label>
      <div className="admin-list-editor">
        {swatches.map((swatch, i) => (
          <div className="admin-swatch-row" key={i}>
            <input
              type="text"
              placeholder="Nombre (ej. Ivory)"
              value={swatch.label}
              onChange={(e) => update(i, { ...swatch, label: e.target.value })}
            />
            <select value={swatch.type} onChange={(e) => setType(i, e.target.value as "image" | "color")}>
              <option value="image">Foto</option>
              <option value="color">Color</option>
            </select>
            {swatch.type === "image" ? (
              <ImagePicker value={swatch.image} onChange={(v) => update(i, { ...swatch, image: v })} />
            ) : (
              <input
                type="color"
                value={swatch.color}
                onChange={(e) => update(i, { ...swatch, color: e.target.value })}
              />
            )}
            <button
              type="button"
              className="admin-btn admin-btn-icon admin-btn-danger"
              onClick={() => remove(i)}
              aria-label="Quitar swatch"
            >
              ✕
            </button>
          </div>
        ))}
        <button type="button" className="admin-btn" onClick={add}>
          + Agregar swatch
        </button>
      </div>
    </div>
  );
}
