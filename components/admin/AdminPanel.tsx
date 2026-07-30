"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
import CatalogRenderer from "@/components/catalog/CatalogRenderer";
import type { Block, CatalogTheme, LayoutId } from "@/data/schema";

type AdminPanelProps = {
  blocks: Block[];
  theme: CatalogTheme;
  layoutId: LayoutId;
  title: string;
  /** Acciones fijas que tienen que seguir alcanzables aunque el panel esté colapsado (volver al listado, cerrar sesión). */
  topbarActions?: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Marco flotante del editor (Fase B de la optimización 2026-07-28):
 * el catálogo real (mismo CatalogRenderer que el sitio público, no una
 * vista previa aparte) queda siempre montado de fondo — reemplaza tanto
 * el <main> plano de /admin/[id] como el botón "Vista previa"
 * (PreviewOverlay, retirado): ya no hay que pedir una vista previa
 * porque el fondo siempre es la vista previa real, en vivo, mientras
 * se edita. El panel de edición en sí (`children`) es colapsable
 * (ESC o el botón ✕) para poder mirar el catálogo completo sin nada
 * encima; un botón flotante lo vuelve a abrir. El fondo se mantiene
 * montado tanto abierto como cerrado para no perder su posición de
 * scroll al alternar.
 */
export default function AdminPanel({
  blocks,
  theme,
  layoutId,
  title,
  topbarActions,
  open,
  onOpenChange,
  children,
}: AdminPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // A diferencia de PreviewOverlay (que solo se montaba después de un
  // clic, nunca en el SSR), este componente vive en el árbol desde el
  // primer render de AdminEditor — incluido el render en el servidor,
  // donde `document` no existe. Portal recién después de montar en el
  // cliente evita el `ReferenceError: document is not defined`.
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- patrón estándar de "portal seguro para SSR": el flip pasa una sola vez, justo después de la hidratación, no en respuesta a un cambio externo que el linter esperaría acá.
  useEffect(() => setMounted(true), []);

  // `onOpenChange` va por un ref, no directo en las deps del efecto de
  // abajo — bug real encontrado en el asistente de creación: ahí se le
  // pasa una función inline nueva en cada render (a diferencia del
  // editor normal, donde es `setPanelOpen`, siempre la misma función),
  // así que el efecto se volvía a disparar en cada tecla — incluido el
  // `panelRef.current?.focus()` — y le robaba el foco al input justo
  // después de cada letra. Con el ref, el efecto solo depende de
  // `open` y sigue llamando siempre a la versión más reciente.
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onOpenChangeRef.current(false);
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [open]);

  // Mismo cálculo que app/admin/actions.ts al guardar: el fondo en vivo
  // tiene que mostrar los números de página reales según el orden
  // actual, no los que hayan quedado de antes de reordenar/agregar.
  const withPageNumbers = blocks.map((block, i) => ({
    ...block,
    data: { ...block.data, pageNumber: i + 1 },
  })) as Block[];

  if (!mounted) return null;

  return createPortal(
    <>
      <div className="admin-panel-live">
        <CatalogRenderer blocks={withPageNumbers} theme={theme} layoutId={layoutId} />
      </div>

      <div className={`admin-panel-topbar${open ? " admin-panel-topbar--panel-open" : ""}`}>
        <p className="admin-panel-topbar-title">{title}</p>
        <div className="admin-panel-topbar-actions">{topbarActions}</div>
      </div>

      {open ? (
        <>
          <div className="admin-panel-scrim" />
          <div
            className="admin-panel"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            ref={panelRef}
            tabIndex={-1}
          >
            <div className="admin-panel-header">
              <p className="admin-panel-header-title">Editar contenido</p>
              <button
                type="button"
                className="admin-panel-close"
                onClick={() => onOpenChange(false)}
                aria-label="Colapsar panel de edición (Esc)"
                title="Colapsar panel de edición (Esc)"
              >
                ✕
              </button>
            </div>
            <div className="admin-panel-body">{children}</div>
          </div>
        </>
      ) : (
        <button
          type="button"
          className="admin-panel-reopen"
          onClick={() => onOpenChange(true)}
          aria-label="Abrir panel de edición"
        >
          ✏️ Editar
        </button>
      )}
    </>,
    document.body
  );
}
