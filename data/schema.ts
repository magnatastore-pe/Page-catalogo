import { z } from "zod";

/**
 * The catalog's data model: what shape any catalog's content must have.
 * This file is catalog-agnostic — it knows nothing about Ariel, dresses,
 * or prices in soles. TypeScript types below are derived from the Zod
 * schemas (`z.infer`) so the runtime contract and the compile-time type
 * can never drift apart. Actual catalog content (data/catalogs/*.ts) is
 * validated against these schemas before it's ever rendered.
 */

// ---- Shared leaf shapes ----

export const SwatchItemSchema = z.discriminatedUnion("type", [
  z.object({ label: z.string(), type: z.literal("image"), image: z.string() }),
  z.object({ label: z.string(), type: z.literal("color"), color: z.string() }),
]);
export type SwatchItem = z.infer<typeof SwatchItemSchema>;

export const CollageLayoutSchema = z.enum(["four", "three", "two", "one"]);
export type CollageLayout = z.infer<typeof CollageLayoutSchema>;

/**
 * Cuántas fotos espera cada layout (fix, 2026-07-29) — `"four"` fija su
 * grilla mobile a 2 columnas (`app/globals.css`), pensada para 4 fotos
 * (2 filas de 2); cargar más de las esperadas no rompe nada en
 * desktop (simplemente agrega filas) pero en mobile duplica la altura
 * del collage y empuja el resto de la sección fuera de la pantalla —
 * ver `components/catalog/Collage.tsx`, que recorta a este número en
 * vez de confiar en que el contenido siempre venga bien contado.
 */
export const COLLAGE_LAYOUT_IMAGE_COUNT: Record<CollageLayout, number> = {
  four: 4,
  three: 3,
  two: 2,
  one: 1,
};

/**
 * `collageLayout` siempre tiene que calzar con la cantidad real de
 * `collageImages` (ver comentario arriba) — dejarlo como un campo
 * editable a mano, separado del propio listado de fotos, es lo que
 * permitió que se desincronizaran más de una vez en producción (ver
 * decision log en CLAUDE.md). El admin ya no lo edita directamente:
 * se deriva acá cada vez que cambia la lista de fotos.
 */
export function deriveCollageLayout(imageCount: number): CollageLayout {
  if (imageCount >= 4) return "four";
  if (imageCount === 3) return "three";
  if (imageCount === 2) return "two";
  return "one";
}

export const CollageImageSchema = z.object({
  src: z.string(),
  alt: z.string(),
});
export type CollageImage = z.infer<typeof CollageImageSchema>;

/**
 * Colores puestos a mano sobre un texto puntual de la página, desde la
 * vista previa del panel (se clickea el texto y se elige el color).
 *
 * La clave es qué se usa de clave: un selector CSS **relativo a la
 * `<section class="page">`** de esa página, no el nombre de un campo de
 * datos. Con 10 plantillas dibujando los mismos datos con componentes
 * distintos, atarlo al campo obligaría a que cada uno de los ~63
 * componentes de `components/catalog/layouts` supiera pintar cada uno
 * de sus textos; atarlo a la posición dentro de la sección lo resuelve
 * en un solo lugar (`CatalogRenderer`, que emite las reglas CSS) y
 * funciona igual en cualquier plantilla. Ver
 * `components/admin/textColorTarget.ts` para el costo de esa decisión.
 *
 * Los dos `regex` no son decorativos: estas dos cadenas terminan
 * literalmente dentro de un `<style>`, así que un valor libre sería una
 * vía de inyección de CSS. Se aceptan solo caracteres de selector y
 * colores `#rgb`/`#rrggbb`.
 */
export const TextColorsSchema = z
  .record(
    z.string().regex(/^[a-zA-Z0-9\s.:>()#_-]+$/),
    z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  )
  .optional();
export type TextColors = z.infer<typeof TextColorsSchema>;

// ---- Section data shapes ----

export const CoverDataSchema = z.object({
  title: z.string(),
  meta: z.array(z.string()),
  subtitle: z.string(),
  bottomLine1: z.string(),
  bottomLine2: z.string(),
  bgImage: z.string(),
  pageNumber: z.number(),
  textColors: TextColorsSchema,
});
export type CoverData = z.infer<typeof CoverDataSchema>;

export const ManifestoDataSchema = z.object({
  heading: z.string(),
  paragraph: z.string(),
  bgImage: z.string(),
  pageNumber: z.number(),
  textColors: TextColorsSchema,
});
export type ManifestoData = z.infer<typeof ManifestoDataSchema>;

export const ProductHeroDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  bgImage: z.string(),
  pageNumber: z.number(),
  textColors: TextColorsSchema,
});
export type ProductHeroData = z.infer<typeof ProductHeroDataSchema>;

export const ChapterHeroSchema = z.object({
  id: z.string(),
  pageNumber: z.number(),
  name: z.string(),
  label: z.string(),
  bgImage: z.string(),
  textColors: TextColorsSchema,
});
export type ChapterHero = z.infer<typeof ChapterHeroSchema>;

export const ProductVariantSchema = z.object({
  id: z.string(),
  pageNumber: z.number(),
  name: z.string(),
  type: z.string(),
  price: z.string(),
  description: z.array(z.string()),
  collageLayout: CollageLayoutSchema,
  collageImages: z.array(CollageImageSchema),
  swatches: z.array(SwatchItemSchema),
  textColors: TextColorsSchema,
});
export type ProductVariant = z.infer<typeof ProductVariantSchema>;

export const ClosingDataSchema = z.object({
  title: z.string(),
  line1: z.string(),
  line2: z.string(),
  bgImage: z.string(),
  pageNumber: z.number(),
  textColors: TextColorsSchema,
});
export type ClosingData = z.infer<typeof ClosingDataSchema>;

// ---- Block: the catalog's unit of composition ----

export const BlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("cover"), data: CoverDataSchema }),
  z.object({ type: z.literal("manifesto"), data: ManifestoDataSchema }),
  z.object({ type: z.literal("productHero"), data: ProductHeroDataSchema }),
  z.object({ type: z.literal("chapterHero"), data: ChapterHeroSchema }),
  z.object({ type: z.literal("productDetail"), data: ProductVariantSchema }),
  z.object({ type: z.literal("closing"), data: ClosingDataSchema }),
]);
export type Block = z.infer<typeof BlockSchema>;

export const CatalogBlocksSchema = z.array(BlockSchema);
export type CatalogBlocks = z.infer<typeof CatalogBlocksSchema>;

// ---- Theme: per-catalog visual identity ----
//
// Maps 1:1 onto the CSS custom properties already used sitewide
// (app/globals.css `:root`) plus the two font stacks used for the
// serif "hero moment" titles vs. everything else — free colors/fonts,
// not a fixed set of presets, applied by CatalogRenderer as inline
// CSS variables scoped to that catalog's render root.

export const CatalogThemeSchema = z.object({
  ink: z.string().min(1),
  paper: z.string().min(1),
  line: z.string().min(1),
  muted: z.string().min(1),
  accent: z.string().min(1),
  displayFont: z.string().min(1),
  bodyFont: z.string().min(1),
});
export type CatalogTheme = z.infer<typeof CatalogThemeSchema>;

// ---- Layout: which set of section components renders this catalog ----
//
// "original" is Ariel's exact, untouched design (components/catalog/*.tsx)
// — every other id maps to a fully distinct Cover/ProductDetail/Statement
// component set under components/catalog/layouts/<id>/. Fixed at catalog
// creation (via the template carousel), not editable afterward — swapping
// a layout on existing content risks a mismatch between the layout's
// visual assumptions (e.g. one photo vs four per colorway) and the data.
export const LayoutIdSchema = z.enum([
  "original",
  "editorial-lux",
  "apple-minimal",
  "ikea-grid",
  "nike-bold",
  "zara-editorial",
  "japanese-minimal",
  "streetwear-dark",
  "architecture-grid",
  "modern-premium",
]);
export type LayoutId = z.infer<typeof LayoutIdSchema>;

export const CatalogEntrySchema = z.object({
  layoutId: LayoutIdSchema.default("original"),
  theme: CatalogThemeSchema,
  blocks: CatalogBlocksSchema,
});
export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;
