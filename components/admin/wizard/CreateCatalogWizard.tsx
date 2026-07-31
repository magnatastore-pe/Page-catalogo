"use client";

import { useMemo, useState } from "react";
import type { Block, CatalogEntry } from "@/data/schema";
import {
  CATALOG_TEMPLATES,
  createStarterCatalog,
  applyImageOverrides,
  countColorwayPairs,
  imageSlotCount,
} from "@/lib/newCatalog";
import { slugify } from "@/lib/slug";
import { createCatalogAction } from "@/app/admin/actions";
import AdminPanel from "../AdminPanel";
import BlockList, { type EditableBlock } from "../BlockList";
import AddPageChooser, { SINGLE_TYPE_LABELS, type SingleType } from "../AddPageChooser";
import { defaultBlockFor } from "../defaultBlock";
import { useConfirm } from "../ConfirmDialogContext";
import { useToast } from "../ToastContext";
import StepInfo from "./StepInfo";
import StepImages, { type WizardImage } from "./StepImages";

type Step = "info" | "images" | "texts" | "done";

const MIN_COLORWAYS = 1;
const MAX_COLORWAYS = 8;

function makeKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function defaultColorwayCountFor(templateId: string): number {
  const template = CATALOG_TEMPLATES.find((t) => t.id === templateId) ?? CATALOG_TEMPLATES[0];
  return countColorwayPairs(template.build("", "", ""));
}

/**
 * Reemplaza AddCatalogForm por un asistente de 3 pasos (info → fotos →
 * textos), viviendo dentro del mismo AdminPanel flotante de la Fase B:
 * el fondo en vivo muestra el catálogo tal como se está armando, no
 * solo al final. Info/Fotos recalculan los bloques "borrador" en cada
 * cambio (createStarterCatalog + applyImageOverrides); al entrar a
 * Textos esos bloques se "congelan" en estado editable (mismo patrón
 * `items`/EditableBlock que AdminEditor) y de ahí en más el admin edita
 * campos directo vía BlockForm (reusado sin cambios) en vez de que se
 * sigan recalculando solos.
 */
export default function CreateCatalogWizard() {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState<Step>("info");

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [templateId, setTemplateId] = useState(CATALOG_TEMPLATES[0].id);
  const [colorwayCount, setColorwayCount] = useState(() => defaultColorwayCountFor(CATALOG_TEMPLATES[0].id));
  const [images, setImages] = useState<WizardImage[]>([]);
  const [items, setItems] = useState<EditableBlock[] | null>(null);

  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdInfo, setCreatedInfo] = useState<{ id: string; commitUrl: string } | null>(null);
  const confirm = useConfirm();
  const { showToast } = useToast();

  const template = CATALOG_TEMPLATES.find((t) => t.id === templateId) ?? CATALOG_TEMPLATES[0];

  // Bloques borrador recalculados en vivo mientras se navega Info/Fotos
  // — es lo que el panel muestra de fondo. Dejan de recalcularse en
  // cuanto se entra a Textos (ahí pasan a vivir en `items`).
  const draftBlocks: Block[] = useMemo(() => {
    const { entry } = createStarterCatalog(name || "Nuevo catálogo", templateId, colorwayCount);
    return applyImageOverrides(entry.blocks, images.map((img) => img.path));
  }, [name, templateId, colorwayCount, images]);

  const blocksForPreview = items ? items.map((item) => item.block) : draftBlocks;

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  function handleTemplateChange(id: string) {
    setTemplateId(id);
    setColorwayCount(defaultColorwayCountFor(id));
  }

  function goToTexts() {
    setItems(draftBlocks.map((block) => ({ key: makeKey(), block })));
    setStep("texts");
  }

  // Agregar página/colorway directo en el Paso 3 — antes solo se podía
  // cambiar la cantidad de colorways volviendo al Paso 1 (el contador),
  // que solo recalcula el borrador, no sirve una vez que los bloques ya
  // se "congelaron" en `items`. Mismo patrón que AddPageChooser ya usa
  // en el editor normal (AdminEditor), aplicado acá sobre `items`.
  const heroBlock = items?.find((item) => item.block.type === "productHero")?.block;
  const defaultProductName = heroBlock?.type === "productHero" ? heroBlock.data.name : "";
  const defaultProductType = heroBlock?.type === "productHero" ? heroBlock.data.type : "";

  const addColorwayToItems = (blocks: [Block, Block]) => {
    if (!items) return;
    setItems([...items, ...blocks.map((block) => ({ key: makeKey(), block }))]);
  };

  const addSingleToItems = (type: SingleType) => {
    if (!items) return;
    setItems([...items, { key: makeKey(), block: defaultBlockFor(type) }]);
    showToast(`${SINGLE_TYPE_LABELS[type]} agregado`);
  };

  function handleCreate() {
    if (!items) return;
    setError(null);
    setIsPending(true);
    const finalId = slugify(slug) || slugify(name);
    const entry: CatalogEntry = {
      layoutId: template.layoutId,
      theme: template.theme,
      blocks: items.map((item) => item.block),
    };
    createCatalogAction(finalId, entry).then((res) => {
      setIsPending(false);
      if (res.ok) {
        setCreatedInfo({ id: res.id, commitUrl: res.commitUrl });
        setStep("done");
      } else {
        setError(res.error);
      }
    });
  }

  function reset() {
    setActive(false);
    setStep("info");
    setName("");
    setSlug("");
    setSlugTouched(false);
    setTemplateId(CATALOG_TEMPLATES[0].id);
    setColorwayCount(defaultColorwayCountFor(CATALOG_TEMPLATES[0].id));
    setImages([]);
    setItems(null);
    setError(null);
    setCreatedInfo(null);
  }

  async function handleCancelRequest() {
    if (step === "done") {
      reset();
      return;
    }
    if (name.trim() === "" && images.length === 0) {
      // Nada que perder todavía — no hace falta confirmar.
      reset();
      return;
    }
    const ok = await confirm({
      title: "Cancelar creación",
      message: "¿Cancelar la creación del catálogo? Se pierde el progreso.",
      confirmLabel: "Descartar",
      danger: true,
    });
    if (ok) reset();
  }

  if (!active) {
    return (
      <button type="button" className="admin-btn admin-btn-primary" onClick={() => setActive(true)}>
        + Nuevo catálogo
      </button>
    );
  }

  return (
    <AdminPanel
      blocks={blocksForPreview}
      theme={template.theme}
      layoutId={template.layoutId}
      title="Nuevo catálogo"
      open
      onOpenChange={(open) => {
        if (!open) handleCancelRequest();
      }}
    >
      <div className="admin-wizard">
        <div className="admin-wizard-steps">
          <span className={step === "info" ? "active" : ""}>1. Info</span>
          <span className={step === "images" ? "active" : ""}>2. Fotos</span>
          <span className={step === "texts" || step === "done" ? "active" : ""}>3. Textos</span>
        </div>

        {step === "info" && (
          <>
            <StepInfo
              name={name}
              onNameChange={handleNameChange}
              slug={slug}
              onSlugChange={(v) => {
                setSlugTouched(true);
                setSlug(v);
              }}
              templates={CATALOG_TEMPLATES}
              templateId={templateId}
              onTemplateChange={handleTemplateChange}
              colorwayCount={colorwayCount}
              onColorwayCountChange={setColorwayCount}
              minColorways={MIN_COLORWAYS}
              maxColorways={MAX_COLORWAYS}
            />
            <div className="admin-save-bar">
              <button type="button" className="admin-btn" onClick={handleCancelRequest}>
                Cancelar
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-primary"
                onClick={() => setStep("images")}
                disabled={!name.trim() || !slug.trim()}
              >
                Siguiente: Fotos →
              </button>
            </div>
            {!name.trim() && <p className="admin-image-picker-note">Completá el nombre del catálogo para continuar.</p>}
          </>
        )}

        {step === "images" && (
          <>
            <StepImages images={images} onChange={setImages} slotCount={imageSlotCount(draftBlocks)} />
            <div className="admin-save-bar">
              <button type="button" className="admin-btn" onClick={() => setStep("info")}>
                ← Atrás
              </button>
              <button type="button" className="admin-btn admin-btn-primary" onClick={goToTexts}>
                Siguiente: Textos →
              </button>
            </div>
          </>
        )}

        {step === "texts" && items && (
          <>
            <p className="admin-image-picker-note">
              Completá o ajustá el texto de cada página. También se puede reordenar o quitar alguna colorway acá.
            </p>
            <BlockList
              items={items}
              onChange={setItems}
              onFocusIndex={(index) => {
                requestAnimationFrame(() => {
                  // El catálogo vive dentro del iframe de PreviewFrame
                  // (otro documento), tanto en la vista de escritorio
                  // como en la de móvil — ver AdminEditor, que hace la
                  // misma búsqueda para el editor normal.
                  const frame = document.querySelector<HTMLIFrameElement>("iframe.admin-preview-frame");
                  const page = frame?.contentDocument?.querySelectorAll<HTMLElement>(".page")[index];
                  if (!page || !frame?.contentWindow) return;
                  // Scroll de la ventana del iframe, no `scrollIntoView`
                  // — ver el comentario en AdminEditor: ese método
                  // atraviesa el borde del iframe y corre el marco del
                  // dispositivo en el documento padre.
                  frame.contentWindow.scrollTo({ top: page.offsetTop, behavior: "smooth" });
                });
              }}
              footer={
                <AddPageChooser
                  defaultProductName={defaultProductName}
                  defaultProductType={defaultProductType}
                  onAddColorway={addColorwayToItems}
                  onAddSingle={addSingleToItems}
                />
              }
            />
            <div className="admin-save-bar">
              <button type="button" className="admin-btn" onClick={() => setStep("images")} disabled={isPending}>
                ← Atrás
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-primary"
                onClick={handleCreate}
                disabled={isPending}
              >
                {isPending ? "Creando…" : "Crear catálogo"}
              </button>
            </div>
            {error && <p className="admin-save-message error">{error}</p>}
          </>
        )}

        {step === "done" && createdInfo && (
          <div className="admin-wizard-done">
            <p className="admin-save-message ok">
              ¡Catálogo &ldquo;{createdInfo.id}&rdquo; creado! Va a estar listo para ver en 1 o 2 minutos.
            </p>
            <a
              className="admin-btn admin-btn-primary admin-wizard-done-link"
              href={`/catalog/${createdInfo.id}`}
              target="_blank"
              rel="noreferrer"
            >
              Ver catálogo
            </a>
            <button type="button" className="admin-btn admin-btn-primary" onClick={reset}>
              Listo
            </button>
          </div>
        )}
      </div>
    </AdminPanel>
  );
}
