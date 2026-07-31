"use client";

import { useState } from "react";
import { createColorwayBlocks } from "@/lib/templates";
import type { Block } from "@/data/schema";
import ImagePicker from "./ImagePicker";
import { useToast } from "./ToastContext";

type AddColorwayFormProps = {
  defaultProductName: string;
  defaultProductType: string;
  onAdd: (blocks: [Block, Block]) => void;
};

/**
 * Template de colorway (Fase 6): un solo paso agrega el par
 * [ChapterHero, ProductDetail] ya vinculado (mismo id/nombre, swatch
 * pre-cargado desde la imagen) en vez de dos bloques sueltos que el
 * admin tendría que enlazar campo por campo.
 */
export default function AddColorwayForm({
  defaultProductName,
  defaultProductType,
  onAdd,
}: AddColorwayFormProps) {
  const [colorwayName, setColorwayName] = useState("");
  const [productName, setProductName] = useState(defaultProductName);
  const [productType, setProductType] = useState(defaultProductType);
  const [bgImage, setBgImage] = useState("/imagenes/base-20260731-c6c17dd3.webp");
  const [swatchType, setSwatchType] = useState<"image" | "color">("image");
  const [swatchColor, setSwatchColor] = useState("#cccccc");
  const { showToast } = useToast();

  const canAdd = colorwayName.trim().length > 0;

  const handleAdd = () => {
    if (!canAdd) return;
    onAdd(
      createColorwayBlocks({
        colorwayName,
        productName,
        productType,
        bgImage,
        swatch: swatchType === "color" ? { type: "color", color: swatchColor } : { type: "image" },
      })
    );
    showToast(`Colorway "${colorwayName}" agregada`);
    setColorwayName("");
  };

  return (
    <div className="admin-add-colorway">
      <p className="admin-add-colorway-title">Agregar colorway (capítulo + detalle vinculados)</p>
      <div className="admin-add-colorway-fields">
        <input
          type="text"
          placeholder="Nombre del colorway (ej. Emerald)"
          value={colorwayName}
          onChange={(e) => setColorwayName(e.target.value)}
        />
        <input
          type="text"
          placeholder="Producto (ej. ARIEL)"
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
        />
        <input
          type="text"
          placeholder="Tipo (ej. DRESS)"
          value={productType}
          onChange={(e) => setProductType(e.target.value)}
        />
        <ImagePicker value={bgImage} onChange={setBgImage} />
        <select value={swatchType} onChange={(e) => setSwatchType(e.target.value as "image" | "color")}>
          <option value="image">Swatch: foto</option>
          <option value="color">Swatch: color</option>
        </select>
        {swatchType === "color" && (
          <input type="color" value={swatchColor} onChange={(e) => setSwatchColor(e.target.value)} />
        )}
        <button
          type="button"
          className="admin-btn admin-btn-primary"
          onClick={handleAdd}
          disabled={!canAdd}
        >
          + Agregar colorway
        </button>
      </div>
    </div>
  );
}
