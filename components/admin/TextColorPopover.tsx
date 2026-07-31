"use client";

import { useEffect, useRef, useState } from "react";

type TextColorPopoverProps = {
  /** Posición del click, en coordenadas de la ventana. */
  x: number;
  y: number;
  /** Texto clickeado (recortado), para que se vea qué se está pintando. */
  sample: string;
  /** Color con el que se está dibujando ese texto ahora. */
  color: string;
  /** true si ese texto ya tiene un color puesto a mano (habilita "quitar"). */
  hasOverride: boolean;
  /** Colores del tema del catálogo, como atajos. */
  presets: string[];
  onChange: (color: string) => void;
  onClear: () => void;
  onClose: () => void;
};

const POPOVER_W = 236;
const POPOVER_H = 210;

/** ¿Es un hexadecimal escribible a mano (#abc o #aabbcc)? */
function isHex(value: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
}

/**
 * Selector de color que aparece al clickear un texto en la vista previa
 * (móvil o escritorio, es el mismo). Escribe directo sobre el bloque,
 * así que el cambio se ve al instante en la vista previa de atrás —
 * era justamente el reclamo de que "los colores no se ven cambiar".
 */
export default function TextColorPopover({
  x,
  y,
  sample,
  color,
  hasOverride,
  presets,
  onChange,
  onClear,
  onClose,
}: TextColorPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Campo de texto propio: mientras se escribe "#ff" no es un color
  // válido todavía, así que no se puede empujar cada tecla al catálogo.
  // No se sincroniza con la prop `color` por efecto: quien lo usa
  // (AdminPanel) le pasa una `key` por texto clickeado, así que abrir
  // otro texto remonta el componente con el color correcto.
  const [draft, setDraft] = useState(color);

  /**
   * Cierre solo cuando el puntero se aleja, sin necesidad de apretar
   * nada.
   *
   * Se sigue el puntero en vez de usar `mouseleave` sobre el propio
   * cuadro: el cuadro se abre justo donde se clickeó, así que si el
   * mouse nunca llega a entrar, `mouseleave` no se dispara nunca y el
   * cuadro se queda para siempre (pasó en la prueba real).
   *
   * Y se escucha en los DOS documentos: el del panel y el del iframe de
   * la vista previa. Los eventos de un iframe no llegan al documento
   * padre, así que mover el mouse sobre el catálogo — que es justo lo
   * que uno hace para "irse" del cuadro — era invisible desde acá.
   */
  const closeTimer = useRef<number | null>(null);

  useEffect(() => {
    const cancel = () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    };
    const schedule = () => {
      if (closeTimer.current !== null) return;
      closeTimer.current = window.setTimeout(() => {
        closeTimer.current = null;
        // Elegir un color en el selector del sistema saca el puntero de
        // la ventana entera; mientras el foco siga adentro del cuadro,
        // no se cierra.
        if (ref.current?.contains(document.activeElement)) return;
        onClose();
      }, 700);
    };

    /** ¿El puntero (en coordenadas de la ventana del panel) está lejos del cuadro? */
    const isFarAway = (x: number, y: number) => {
      const box = ref.current?.getBoundingClientRect();
      if (!box) return false;
      const margin = 48;
      return x < box.left - margin || x > box.right + margin || y < box.top - margin || y > box.bottom + margin;
    };

    const onPanelMove = (e: MouseEvent) => (isFarAway(e.clientX, e.clientY) ? schedule() : cancel());

    const frame = document.querySelector<HTMLIFrameElement>("iframe.admin-preview-frame");
    const frameDoc = frame?.contentDocument ?? null;
    const onPreviewMove = (e: MouseEvent) => {
      if (!frame) return;
      // El dispositivo está escalado (ver PreviewFrame): las
      // coordenadas de adentro del iframe hay que pasarlas por la misma
      // escala para compararlas con la caja del cuadro, que vive en el
      // documento del panel.
      const rect = frame.getBoundingClientRect();
      const scale = rect.width / (frame.offsetWidth || rect.width);
      const x = rect.left + e.clientX * scale;
      const y = rect.top + e.clientY * scale;
      return isFarAway(x, y) ? schedule() : cancel();
    };

    document.addEventListener("mousemove", onPanelMove);
    frameDoc?.addEventListener("mousemove", onPreviewMove);
    return () => {
      cancel();
      document.removeEventListener("mousemove", onPanelMove);
      frameDoc?.removeEventListener("mousemove", onPreviewMove);
    };
  }, [onClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // Se cierra el selector, pero NO se colapsa el panel de edición:
      // el handler global de AdminPanel también escucha Escape, y sin
      // esto un solo Escape hacía las dos cosas a la vez.
      e.stopPropagation();
      onClose();
    }
    function onPointerDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    // También adentro del iframe: clickear la vista previa deja el foco
    // ahí, y las teclas de un iframe no llegan al documento padre — así
    // que Esc no cerraba nada justo después de elegir un texto, que es
    // el momento en que más se lo usa.
    const frameDoc =
      document.querySelector<HTMLIFrameElement>("iframe.admin-preview-frame")?.contentDocument ?? null;

    document.addEventListener("keydown", onKey, true);
    frameDoc?.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      frameDoc?.removeEventListener("keydown", onKey, true);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [onClose]);

  // Que no se salga de la pantalla: si el click fue cerca del borde
  // derecho o de abajo, el cuadro se corre para adentro.
  const left = Math.min(Math.max(8, x), window.innerWidth - POPOVER_W - 8);
  const top = Math.min(Math.max(8, y), window.innerHeight - POPOVER_H - 8);

  return (
    <div
      className="admin-textcolor-popover"
      style={{ left, top }}
      ref={ref}
      role="dialog"
      aria-label="Color del texto"
    >
      <p className="admin-textcolor-sample" title={sample}>
        {sample || "Texto"}
      </p>

      <div className="admin-textcolor-row">
        <input
          type="color"
          value={isHex(draft) ? draft : color}
          onChange={(e) => {
            setDraft(e.target.value);
            onChange(e.target.value);
          }}
          aria-label="Elegir color"
        />
        <input
          type="text"
          className="admin-textcolor-hex"
          value={draft}
          spellCheck={false}
          onChange={(e) => {
            const next = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
            setDraft(next);
            if (isHex(next)) onChange(next);
          }}
          aria-label="Color hexadecimal"
        />
      </div>

      <div className="admin-textcolor-presets">
        {["#ffffff", "#000000", ...presets].map((preset, i) => (
          <button
            key={`${preset}-${i}`}
            type="button"
            className="admin-textcolor-preset"
            style={{ background: preset }}
            onClick={() => {
              setDraft(preset);
              onChange(preset);
            }}
            title={preset.toUpperCase()}
            aria-label={`Usar ${preset}`}
          />
        ))}
      </div>

      <div className="admin-textcolor-actions">
        {/* Ya no hay botón "Listo": el cuadro se cierra solo al sacar el
            mouse, al clickear en cualquier otro lado (incluida la vista
            previa) o con Esc. "Quitar" sí se queda, porque volver al
            color de diseño no se puede pedir de ninguna otra forma. */}
        <span className="admin-textcolor-note">Se cierra solo</span>
        <button type="button" className="admin-btn admin-btn-icon" onClick={onClear} disabled={!hasOverride}>
          Quitar color
        </button>
      </div>
    </div>
  );
}
