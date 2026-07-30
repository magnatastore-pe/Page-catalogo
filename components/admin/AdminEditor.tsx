"use client";

import { useState, useTransition, type ReactNode } from "react";
import type { Block, CatalogTheme, LayoutId } from "@/data/schema";
import BlockList, { type EditableBlock } from "./BlockList";
import BlockForm from "./BlockForm";
import AddPageChooser from "./AddPageChooser";
import AdminPanel from "./AdminPanel";
import AssetGallery from "./AssetGallery";
import ThemeEditor from "./fields/ThemeEditor";
import { useToast } from "./ToastContext";
import { saveCatalogAction } from "@/app/admin/actions";
import { CATALOG_TEMPLATES } from "@/lib/newCatalog";
import { defaultBlockFor } from "./defaultBlock";

const LAYOUT_LABELS: Partial<Record<LayoutId, string>> = Object.fromEntries(
  CATALOG_TEMPLATES.map((t) => [t.layoutId, t.label])
);

const TYPE_LABELS: Record<Block["type"], string> = {
  cover: "Portada",
  manifesto: "Manifiesto",
  productHero: "Hero de producto",
  chapterHero: "Capítulo (transición de colorway)",
  productDetail: "Detalle de producto (colorway)",
  closing: "Cierre",
};

function makeKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

type Tab = "portada" | "paginas" | "imagenes" | "colores";

const TABS: { id: Tab; label: string }[] = [
  { id: "portada", label: "Portada" },
  { id: "paginas", label: "Páginas" },
  { id: "imagenes", label: "Imágenes" },
  { id: "colores", label: "Colores" },
];

type AdminEditorProps = {
  catalogId: string;
  initialBlocks: Block[];
  initialTheme: CatalogTheme;
  /** Fijo al crear el catálogo (ver lib/newCatalog.ts) — no hay campo para editarlo acá a propósito: cambiarlo después podría dejar contenido que no calza con los supuestos visuales del layout nuevo. */
  layoutId: LayoutId;
  /** Acciones que tienen que seguir alcanzables aunque el panel esté colapsado (volver al listado, cerrar sesión) — vienen de app/admin/[id]/page.tsx, que sí sabe de <Link>/LogoutButton. */
  topbarActions?: ReactNode;
};

type SaveResult = Awaited<ReturnType<typeof saveCatalogAction>>;

export default function AdminEditor({
  catalogId,
  initialBlocks,
  initialTheme,
  layoutId,
  topbarActions,
}: AdminEditorProps) {
  const [items, setItems] = useState<EditableBlock[]>(() =>
    initialBlocks.map((block) => ({ key: makeKey(), block }))
  );
  const [theme, setTheme] = useState<CatalogTheme>(initialTheme);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<SaveResult | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [tab, setTab] = useState<Tab>("portada");
  const { showToast } = useToast();

  // La portada se edita directo en su propia pestaña, no como una
  // tarjeta más de la lista — se asume en índice 0 (así la arma tanto
  // el wizard como cada plantilla en lib/newCatalog.ts) para no tener
  // que reordenarla de vuelta a mano cada vez que cambia la pestaña
  // "Páginas".
  const coverIndex = items.findIndex((item) => item.block.type === "cover");
  const coverItem = coverIndex >= 0 ? items[coverIndex] : undefined;
  const pageItems = items.filter((_, i) => i !== coverIndex);

  const updateCover = (block: Block) => {
    if (coverIndex < 0) return;
    setItems(items.map((item, i) => (i === coverIndex ? { ...item, block } : item)));
  };

  const setPageItems = (next: EditableBlock[]) => {
    setItems(coverItem ? [coverItem, ...next] : next);
  };

  // Hace scroll del fondo en vivo (el catálogo real, siempre montado
  // detrás del panel — ver AdminPanel) hasta la página que se acaba de
  // abrir para editar o de mover, en vez de dejarlo donde haya quedado.
  // `pageItemsIndex` es el índice dentro de `pageItems` (lo que ve
  // BlockList); se le suma 1 si hay portada porque esta vive aparte, en
  // el índice 0 de `items` — que es el array real que ve AdminPanel. El
  // rAF espera a que React termine de aplicar el reorden/cambio de
  // estado antes de medir posiciones en el DOM; sin él se mide el orden
  // viejo, todavía no pintado.
  const focusLivePreview = (pageItemsIndex: number) => {
    const itemsIndex = coverItem ? pageItemsIndex + 1 : pageItemsIndex;
    requestAnimationFrame(() => {
      const pages = document.querySelectorAll<HTMLElement>(".admin-panel-live .page");
      pages[itemsIndex]?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const addSingle = (type: Exclude<Block["type"], "cover" | "chapterHero" | "productDetail">) => {
    setPageItems([...pageItems, { key: makeKey(), block: defaultBlockFor(type) }]);
    showToast(`${TYPE_LABELS[type]} agregado`);
  };

  const addColorway = (blocks: [Block, Block]) => {
    setPageItems([...pageItems, ...blocks.map((block) => ({ key: makeKey(), block }))]);
  };

  // Precompletar el template de colorway con el nombre/tipo del producto
  // ya existente en el catálogo, en vez de arrancar en blanco.
  const heroBlock = items.find((item) => item.block.type === "productHero")?.block;
  const defaultProductName = heroBlock?.type === "productHero" ? heroBlock.data.name : "";
  const defaultProductType = heroBlock?.type === "productHero" ? heroBlock.data.type : "";

  const handleSave = () => {
    setResult(null);
    startTransition(async () => {
      const res = await saveCatalogAction(
        catalogId,
        theme,
        items.map((item) => item.block),
        layoutId
      );
      setResult(res);
      if (res.ok) showToast("Guardado ✓");
    });
  };

  return (
    <AdminPanel
      blocks={items.map((item) => item.block)}
      theme={theme}
      layoutId={layoutId}
      title={catalogId}
      topbarActions={topbarActions}
      open={panelOpen}
      onOpenChange={setPanelOpen}
    >
      <div className="admin-idstrip">
        <p className="admin-idstrip-name">{catalogId}</p>
        <p className="admin-idstrip-meta">
          Plantilla: {LAYOUT_LABELS[layoutId] ?? layoutId} (fija al crear)
        </p>
      </div>

      <div className="admin-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`admin-tab${tab === t.id ? " active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="admin-tab-content">
        {tab === "portada" &&
          (coverItem ? (
            <BlockForm block={coverItem.block} onChange={updateCover} />
          ) : (
            <p>Este catálogo no tiene portada.</p>
          ))}

        {tab === "paginas" && (
          <BlockList
            items={pageItems}
            onChange={setPageItems}
            onFocusIndex={focusLivePreview}
            footer={
              <AddPageChooser
                defaultProductName={defaultProductName}
                defaultProductType={defaultProductType}
                onAddColorway={addColorway}
                onAddSingle={addSingle}
              />
            }
          />
        )}

        {tab === "imagenes" && <AssetGallery />}

        {tab === "colores" && <ThemeEditor theme={theme} onChange={setTheme} />}
      </div>

      <div className="admin-save-bar">
        <button
          type="button"
          className="admin-btn admin-btn-primary"
          onClick={handleSave}
          disabled={isPending}
        >
          {isPending ? "Guardando…" : "Guardar y publicar"}
        </button>

        {result &&
          (result.ok ? (
            <p className="admin-save-message ok">
              Guardado.{" "}
              <a href={result.commitUrl} target="_blank" rel="noreferrer">
                Ver commit
              </a>
            </p>
          ) : (
            <div>
              <p className="admin-save-message error">{result.error}</p>
              {result.issues && (
                <ul className="admin-save-issues">
                  {result.issues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
      </div>
    </AdminPanel>
  );
}
