"use client";

import { useRef, useState, type ReactNode } from "react";
import type { Block } from "@/data/schema";
import BlockForm from "./BlockForm";
import { useConfirm } from "./ConfirmDialogContext";
import { groupItemsForDisplay, type DisplayGroup } from "./blockGrouping";
import { checkCompleteness, checkColorwayCompleteness } from "./pageCompleteness";

/**
 * `key` es un identificador sintético, solo para React/la UI del panel
 * — nunca viaja a data/schema.ts ni al commit. Hace falta porque
 * `block.data.id` puede estar vacío o duplicado mientras se edita, y
 * porque el orden cambia (subir/bajar), así que un índice de array no
 * alcanza para no perder el estado de "qué página está abierta".
 */
export type EditableBlock = {
  key: string;
  block: Block;
};

const TYPE_LABELS: Record<Block["type"], string> = {
  cover: "Portada",
  manifesto: "Manifiesto",
  productHero: "Hero",
  chapterHero: "Capítulo",
  productDetail: "Detalle",
  closing: "Cierre",
};

function blockTitle(block: Block): string {
  switch (block.type) {
    case "cover":
      return block.data.title || "(sin título)";
    case "manifesto":
      return block.data.heading || "(sin título)";
    case "productHero":
      return block.data.name || "(sin nombre)";
    case "chapterHero":
      return block.data.name || block.data.label ? `${block.data.name} — ${block.data.label}` : "(sin nombre)";
    case "productDetail":
      return block.data.name || block.data.type ? `${block.data.name} — ${block.data.type}` : "(sin nombre)";
    case "closing":
      return block.data.title || "(sin título)";
  }
}

function blockThumb(block: Block): string | null {
  switch (block.type) {
    case "cover":
    case "manifesto":
    case "productHero":
    case "chapterHero":
    case "closing":
      return block.data.bgImage;
    case "productDetail":
      return block.data.collageImages[0]?.src ?? null;
  }
}

/** Para una tarjeta de colorway: preferimos la foto real del detalle (la prenda en sí) sobre el fondo editorial del capítulo. */
function colorwayThumb(chapter: Block, detail: Block): string | null {
  return blockThumb(detail) ?? blockThumb(chapter);
}

type Active = { kind: "single"; key: string } | { kind: "colorway"; chapterKey: string };

type BlockListProps = {
  items: EditableBlock[];
  onChange: (items: EditableBlock[]) => void;
  /** Se muestra debajo de la grilla de tarjetas — nunca durante la edición enfocada de una página, para no ensuciar esa vista con la UI de "agregar" otra. */
  footer?: ReactNode;
  /** Se llama con el índice (dentro de `items`) de la página que pasa a estar enfocada — al abrir su edición o al moverla — para que quien la use pueda hacer scroll del fondo en vivo hasta ahí. */
  onFocusIndex?: (index: number) => void;
};

export default function BlockList({ items, onChange, footer, onFocusIndex }: BlockListProps) {
  const [active, setActive] = useState<Active | null>(null);
  const confirm = useConfirm();

  /**
   * Un colorway se edita en una sola tarjeta pero son DOS páginas del
   * catálogo (la transición y el detalle con el collage). Al abrirlo se
   * enfocaba solo la transición, así que editando las fotos del collage
   * la vista previa seguía mostrando la otra página — se estaba
   * cambiando algo que no se veía.
   *
   * Con esto la vista previa sigue a la sección donde está el foco:
   * tocar cualquier campo de "Detalle" la lleva a la página de detalle,
   * y volver a "Transición" la trae de vuelta. Se recuerda cuál fue la
   * última para no re-disparar el scroll suave en cada tab entre campos
   * de la misma sección, que quedaba muy inquieto.
   */
  const lastFocusedIndex = useRef<number | null>(null);
  const followSection = (index: number) => {
    if (lastFocusedIndex.current === index) return;
    lastFocusedIndex.current = index;
    onFocusIndex?.(index);
  };

  const moveUp = (i: number) => {
    if (i === 0) return;
    const next = [...items];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    onChange(next);
    onFocusIndex?.(i - 1);
  };

  const moveDown = (i: number) => {
    if (i === items.length - 1) return;
    const next = [...items];
    [next[i], next[i + 1]] = [next[i + 1], next[i]];
    onChange(next);
    onFocusIndex?.(i + 1);
  };

  const remove = async (i: number) => {
    if (!(await confirm({ message: "¿Quitar esta página del catálogo?", confirmLabel: "Quitar", danger: true }))) return;
    onChange(items.filter((_, idx) => idx !== i));
    setActive(null);
  };

  const removeColorway = async (chapterIndex: number) => {
    if (
      !(await confirm({
        message: "¿Quitar este colorway del catálogo? Se borran sus dos páginas (capítulo y detalle).",
        confirmLabel: "Quitar",
        danger: true,
      }))
    )
      return;
    const next = [...items];
    next.splice(chapterIndex, 2);
    onChange(next);
    setActive(null);
  };

  const updateBlock = (i: number, block: Block) => {
    onChange(items.map((item, idx) => (idx === i ? { ...item, block } : item)));
  };

  // Mueve el par [capítulo, detalle] que arranca en `startIndex` una
  // posición entera hacia arriba/abajo, en vez de mover cada bloque por
  // separado — así reordenar un colorway completo es 1 clic en vez de 2.
  const moveGroupUp = (startIndex: number) => {
    if (startIndex === 0) return;
    const next = [...items];
    const pair = next.splice(startIndex, 2);
    next.splice(startIndex - 1, 0, ...pair);
    onChange(next);
    onFocusIndex?.(startIndex - 1);
  };

  const moveGroupDown = (startIndex: number) => {
    if (startIndex + 2 >= items.length) return;
    const next = [...items];
    const pair = next.splice(startIndex, 2);
    next.splice(startIndex + 1, 0, ...pair);
    onChange(next);
    onFocusIndex?.(startIndex + 1);
  };

  if (items.length === 0) {
    return (
      <>
        <p>Este catálogo no tiene páginas todavía. Agregá una abajo.</p>
        {footer}
      </>
    );
  }

  const groups = groupItemsForDisplay(items);
  const structure = groups.filter((g): g is Extract<DisplayGroup, { kind: "single" }> => g.kind === "single");
  const colorways = groups.filter((g): g is Extract<DisplayGroup, { kind: "colorway" }> => g.kind === "colorway");

  // ---- vista de edición enfocada (drill-down) ----
  if (active?.kind === "single") {
    const group = structure.find((g) => g.item.key === active.key);
    if (group) {
      return (
        <div className="admin-page-detail">
          <button type="button" className="admin-page-detail-back" onClick={() => setActive(null)}>
            ← Páginas
          </button>
          <h4 className="admin-page-detail-title">{TYPE_LABELS[group.item.block.type]}</h4>
          <BlockForm block={group.item.block} onChange={(b) => updateBlock(group.index, b)} />
        </div>
      );
    }
  }

  if (active?.kind === "colorway") {
    const group = colorways.find((g) => g.chapter.key === active.chapterKey);
    if (group) {
      const chapterData = group.chapter.block.type === "chapterHero" ? group.chapter.block.data : null;
      return (
        <div className="admin-page-detail">
          <button type="button" className="admin-page-detail-back" onClick={() => setActive(null)}>
            ← Páginas
          </button>
          <h4 className="admin-page-detail-title">
            Colorway: {chapterData?.label || chapterData?.name || "(sin nombre)"}
          </h4>

          <p className="admin-page-detail-hint">
            Este colorway son 2 páginas. La vista previa sigue a la sección que estés editando.
          </p>

          <div className="admin-field-group" onFocusCapture={() => followSection(group.chapterIndex)}>
            <button
              type="button"
              className="admin-field-group-jump"
              onClick={() => followSection(group.chapterIndex)}
            >
              Transición (capítulo) <span aria-hidden="true">↗</span>
            </button>
            <BlockForm block={group.chapter.block} onChange={(b) => updateBlock(group.chapterIndex, b)} />
          </div>

          <div className="admin-field-group" onFocusCapture={() => followSection(group.detailIndex)}>
            <button
              type="button"
              className="admin-field-group-jump"
              onClick={() => followSection(group.detailIndex)}
            >
              Detalle (fotos y precio) <span aria-hidden="true">↗</span>
            </button>
            <BlockForm block={group.detail.block} onChange={(b) => updateBlock(group.detailIndex, b)} />
          </div>
        </div>
      );
    }
  }

  // ---- grilla de tarjetas ----
  function renderCard(item: EditableBlock, i: number) {
    const thumb = blockThumb(item.block);
    const completeness = checkCompleteness(item.block);
    return (
      <div className="admin-page-card" key={item.key}>
        <button
          type="button"
          className="admin-page-card-open"
          onClick={() => {
            setActive({ kind: "single", key: item.key });
            followSection(i);
          }}
        >
          <div className="admin-page-card-thumb" style={thumb ? { backgroundImage: `url(${thumb})` } : undefined} />
          <div className="admin-page-card-body">
            <span className="admin-block-tag">{TYPE_LABELS[item.block.type]}</span>
            <p className="admin-page-card-title">{blockTitle(item.block)}</p>
            {!completeness.ok && <span className="admin-badge-warn">Falta: {completeness.missing.join(", ")}</span>}
          </div>
        </button>
        <div className="admin-page-card-controls">
          <button type="button" className="admin-btn admin-btn-icon" onClick={() => moveUp(i)} disabled={i === 0} aria-label="Subir página">
            ↑
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-icon"
            onClick={() => moveDown(i)}
            disabled={i === items.length - 1}
            aria-label="Bajar página"
          >
            ↓
          </button>
          <button type="button" className="admin-btn admin-btn-icon admin-btn-danger" onClick={() => remove(i)} aria-label="Quitar página">
            ✕
          </button>
        </div>
      </div>
    );
  }

  function renderColorwayCard(group: Extract<DisplayGroup, { kind: "colorway" }>) {
    const chapterData = group.chapter.block.type === "chapterHero" ? group.chapter.block.data : null;
    const thumb = colorwayThumb(group.chapter.block, group.detail.block);
    const label = chapterData?.label || chapterData?.name || "(sin nombre)";
    const completeness = checkColorwayCompleteness(group.chapter.block, group.detail.block);
    return (
      <div className="admin-page-card" key={`colorway-${group.chapter.key}`}>
        <button
          type="button"
          className="admin-page-card-open"
          onClick={() => {
            setActive({ kind: "colorway", chapterKey: group.chapter.key });
            followSection(group.chapterIndex);
          }}
        >
          <div className="admin-page-card-thumb" style={thumb ? { backgroundImage: `url(${thumb})` } : undefined} />
          <div className="admin-page-card-body">
            <span className="admin-block-tag">Colorway</span>
            <p className="admin-page-card-title">{label}</p>
            {!completeness.ok && <span className="admin-badge-warn">Falta: {completeness.missing.join(", ")}</span>}
          </div>
        </button>
        <div className="admin-page-card-controls">
          <button
            type="button"
            className="admin-btn admin-btn-icon"
            onClick={() => moveGroupUp(group.chapterIndex)}
            disabled={group.chapterIndex === 0}
            aria-label="Subir colorway"
          >
            ↑
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-icon"
            onClick={() => moveGroupDown(group.chapterIndex)}
            disabled={group.chapterIndex + 2 >= items.length}
            aria-label="Bajar colorway"
          >
            ↓
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-icon admin-btn-danger"
            onClick={() => removeColorway(group.chapterIndex)}
            aria-label="Quitar colorway"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page-groups">
      <div className="admin-page-group">
        <p className="admin-page-group-label">Estructura del catálogo</p>
        <div className="admin-page-grid">
          {groups.map((g) => (g.kind === "single" ? renderCard(g.item, g.index) : renderColorwayCard(g)))}
        </div>
      </div>

      {footer}
    </div>
  );
}
