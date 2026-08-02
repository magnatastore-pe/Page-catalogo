import type { ProductVariant } from "@/data/schema";

/**
 * Una página de detalle se muestra como agotada si lo está el modelo
 * entero o cualquiera de sus colores.
 *
 * Que un solo color agotado pinte TODAS las fotos en gris es una
 * decisión explícita del producto, no un descuido: las fotos son de la
 * página (el colorway), no de un swatch puntual, así que no hay forma
 * de agrisar "solo las de ese color". A cambio, los swatches que sí
 * están disponibles se siguen viendo a todo color — ver la regla
 * `.swatch:not(.swatch-sold-out)` en app/globals.css.
 */
export function isVariantSoldOut(variant: ProductVariant): boolean {
  return variant.soldOut === true || variant.swatches.some((s) => s.soldOut === true);
}

/**
 * Sufijo de clase para la `<section class="page">` de cada plantilla.
 * Es la única forma de que el estado llegue al CSS sin que las 10
 * plantillas repitan la misma lógica.
 */
export function soldOutClass(variant: ProductVariant): string {
  return isVariantSoldOut(variant) ? " is-sold-out" : "";
}
