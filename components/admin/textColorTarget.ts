/**
 * Traduce un click en la vista previa a "qué texto de qué página se
 * quiere pintar", sin que ningún componente del catálogo tenga que
 * saber que esto existe.
 *
 * La clave del diseño: el color NO se guarda contra un campo de datos
 * (título, subtítulo, precio…), porque cada una de las 10 plantillas
 * dibuja esos campos con componentes distintos y habría que tocar las
 * ~63 piezas de components/catalog/layouts para que cada una supiera
 * pintar cada uno de sus textos. Se guarda contra la POSICIÓN del
 * elemento dentro de su `<section class="page">` — una cadena de
 * `tag:nth-of-type(n)` — que después `CatalogRenderer` convierte en una
 * regla CSS. Así funciona igual en cualquier plantilla, presente o
 * futura, con cero cambios en los componentes de render.
 *
 * El costo real de esa decisión, dicho de frente: la referencia es
 * estructural, así que si alguna vez se cambia el HTML de un componente
 * de layout (agregar un <div> envolvente, mover un texto de lugar), los
 * colores guardados de esa plantilla pueden terminar aplicados al
 * elemento equivocado o a ninguno. No se corrompen datos ni se rompe el
 * render — solo se pierde/desubica un color, y se vuelve a clickear.
 */

export type TextColorTarget = {
  /** Índice de la página dentro del array de bloques del catálogo. */
  blockIndex: number;
  /** Selector CSS relativo a `section.page`. */
  selector: string;
  /** Color efectivo que tiene ese texto ahora mismo, en #rrggbb. */
  currentColor: string;
  /** Dónde dibujar el selector de color, en coordenadas de la ventana del panel. */
  x: number;
  y: number;
  /** Un pedacito del texto, para que el popover diga qué se está pintando. */
  sample: string;
};

/** ¿Este elemento tiene texto propio (no solo hijos que lo tienen)? */
function hasOwnText(el: Element): boolean {
  return Array.from(el.childNodes).some(
    (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim().length > 0
  );
}

/**
 * Sube desde el elemento clickeado hasta encontrar el que realmente
 * tiene el texto. Clickear sobre una palabra puede caer en un <span>
 * interno, en el contenedor, o en el propio nodo de texto: los tres
 * tienen que terminar en el mismo elemento pintable.
 */
function findTextElement(from: Element, section: Element): Element | null {
  let cur: Element | null = from;
  while (cur && cur !== section) {
    if (hasOwnText(cur)) return cur;
    cur = cur.parentElement;
  }
  return null;
}

/**
 * Qué texto hay realmente bajo el puntero.
 *
 * No alcanza con `event.target`: casi todas las páginas del catálogo
 * tienen un `.page-overlay` (el degradado sobre la foto) en
 * `position: absolute`, que por el orden de pintado del CSS queda por
 * encima del texto y se lleva el clic — el mismo problema que ya había
 * dejado inclickeable el link de descarga del PDF en la página de
 * cierre (ver decision log, 2026-07-27). Con el título de la portada
 * pasaba exactamente eso: el clic llegaba al degradado, no al <h1>.
 *
 * `elementsFromPoint` devuelve TODO lo que hay bajo ese punto, de
 * arriba hacia abajo, así que se puede atravesar el degradado (y
 * cualquier otro elemento decorativo de cualquiera de las 10
 * plantillas) hasta el primer elemento que de verdad tenga texto, sin
 * tener que ir tapando casos uno por uno en el CSS público.
 */
export function findPaintableElement(doc: Document, clientX: number, clientY: number): Element | null {
  for (const candidate of doc.elementsFromPoint(clientX, clientY)) {
    const section = candidate.closest("section.page");
    if (!section) continue;
    const el = findTextElement(candidate, section);
    if (el) return el;
  }
  return null;
}

/** Cadena `tag:nth-of-type(n) > tag:nth-of-type(n)` desde (sin incluir) la sección hasta el elemento. */
export function selectorWithinSection(section: Element, el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur !== section) {
    const parent: Element | null = cur.parentElement;
    if (!parent) return "";
    const sameTag = Array.from(parent.children).filter((c) => c.tagName === cur!.tagName);
    parts.unshift(`${cur.tagName.toLowerCase()}:nth-of-type(${sameTag.indexOf(cur) + 1})`);
    cur = parent;
  }
  return parts.join(" > ");
}

/** `rgb(r, g, b)` (lo que devuelve getComputedStyle) → `#rrggbb`, que es lo único que acepta <input type="color">. */
function rgbToHex(rgb: string): string {
  const match = rgb.match(/\d+/g);
  if (!match || match.length < 3) return "#000000";
  return (
    "#" +
    match
      .slice(0, 3)
      .map((n) => Number(n).toString(16).padStart(2, "0"))
      .join("")
  );
}

/**
 * @param el elemento de texto ya resuelto (ver `findPaintableElement`)
 * @param frameRect posición en pantalla del iframe, para poder ubicar el popover
 * @param scale escala con la que se está dibujando el dispositivo (ver PreviewFrame)
 * @param clientX/clientY coordenadas del click, en el sistema del iframe
 */
export function resolveTextColorTarget(
  el: Element,
  frameRect: DOMRect,
  scale: number,
  clientX: number,
  clientY: number
): TextColorTarget | null {
  const section = el.closest("section.page");
  if (!section) return null;

  const doc = section.ownerDocument;
  const pages = Array.from(doc.querySelectorAll(".catalog-root > section.page"));
  const blockIndex = pages.indexOf(section);
  if (blockIndex < 0) return null;

  const selector = selectorWithinSection(section, el);
  if (!selector) return null;

  const view = doc.defaultView;
  const currentColor = view ? rgbToHex(view.getComputedStyle(el).color) : "#000000";

  return {
    blockIndex,
    selector,
    currentColor,
    x: frameRect.left + clientX * scale,
    y: frameRect.top + clientY * scale,
    sample: (el.textContent ?? "").trim().slice(0, 40),
  };
}
