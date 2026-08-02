import type { CSSProperties } from "react";
import ScrollProgress from "./ScrollProgress";
import ScrollReveal from "./ScrollReveal";
import BlockRenderer from "./BlockRenderer";
import type { CatalogBlocks, CatalogTheme, LayoutId } from "@/data/schema";

type CatalogRendererProps = {
  blocks: CatalogBlocks;
  /** Identidad visual del catálogo (colores + tipografías). Se aplica
   * como CSS custom properties inline, así que solo pisa el `:root` de
   * app/globals.css para este árbol — nunca a otros catálogos ni al
   * resto del sitio. */
  theme?: CatalogTheme;
  /** Qué set de componentes usar para dibujar cada bloque — ver
   * components/catalog/layouts. Por defecto "original" (Ariel). */
  layoutId?: LayoutId;
  /** Link de descarga del PDF del catálogo (Fase 7), si existe. */
  pdfHref?: string;
};

function themeStyle(theme?: CatalogTheme): CSSProperties | undefined {
  if (!theme) return undefined;
  return {
    "--ink": theme.ink,
    "--paper": theme.paper,
    "--line": theme.line,
    "--muted": theme.muted,
    "--accent": theme.accent,
    "--display-font": theme.displayFont,
    "--body-font": theme.bodyFont,
  } as CSSProperties;
}

/**
 * Convierte los `textColors` de cada bloque (ver `TextColorsSchema` en
 * data/schema.ts) en reglas CSS reales.
 *
 * Es el único lugar del render que sabe de esta función: los selectores
 * se resuelven contra la posición de la página (`section.page` n-ésima
 * dentro de `.catalog-root`), así que ningún componente de sección — ni
 * los 9 sets de plantilla — necesita enterarse. Cada bloque dibuja
 * exactamente una `<section class="page">` como hija directa de
 * `.catalog-root`, así que el índice del bloque y el `:nth-of-type` de
 * la sección son la misma cuenta.
 *
 * `!important` es necesario: el color que se está pisando viene de una
 * regla de clase en app/globals.css (o en el CSS de la plantilla), que
 * de otro modo gana o empata por especificidad.
 */
function textColorCss(blocks: CatalogBlocks): string {
  const rules: string[] = [];
  blocks.forEach((block, i) => {
    const colors = block.data.textColors;
    if (!colors) return;
    for (const [selector, color] of Object.entries(colors)) {
      rules.push(
        `.catalog-root > section.page:nth-of-type(${i + 1}) ${selector}{color:${color} !important}`
      );
    }
  });
  return rules.join("\n");
}

/**
 * Dibuja un catálogo completo a partir de su lista de bloques: la barra
 * de progreso más cada bloque en el orden en que aparece en los datos.
 * No sabe ni le importa de qué catálogo se trata — quien llama decide
 * qué `blocks`/`theme` pasarle (ver data/catalogs/index.ts).
 */
export default function CatalogRenderer({ blocks, theme, layoutId = "original", pdfHref }: CatalogRendererProps) {
  const customTextColors = textColorCss(blocks);

  return (
    <main className="catalog-root" style={themeStyle(theme)}>
      {customTextColors && <style>{customTextColors}</style>}
      <ScrollProgress />
      <ScrollReveal />
      {blocks.map((block, i) => (
        <BlockRenderer
          // La key sale de la POSICIÓN, no de `pageNumber`: ese número
          // se recalcula al guardar, así que un catálogo puede tener
          // varios bloques con el mismo (lux tiene tres en 0) y React
          // avisaba de keys duplicadas — con riesgo real de omitir o
          // duplicar una página. El orden del array es la identidad.
          key={`${block.type}-${i}`}
          block={block}
          layoutId={layoutId}
          pdfHref={pdfHref}
        />
      ))}
    </main>
  );
}
