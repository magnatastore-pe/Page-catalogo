"use client";

import { useEffect, useRef } from "react";

/**
 * Anima la entrada de CADA página del catálogo: sus bloques de texto
 * suben y aparecen, y sus fotos aparecen con un zoom suave. Se repite
 * cada vez que la página vuelve a entrar en pantalla, igual que
 * `RevealOnScroll` (que sigue existiendo para los bloques que ya lo
 * usaban, con su propio escalonado).
 *
 * Se resuelve acá, observando las `<section class="page">`, y no
 * componente por componente: son 6 tipos de bloque x 10 plantillas, y
 * ninguna de esas 60 piezas necesita enterarse de que existe una
 * animación. Lo único que hacen las reglas CSS (app/globals.css) es
 * mirar las clases que este componente pone.
 *
 * Decisión importante para no romper nada: la clase `page-anim` la
 * pone el JavaScript, no viene en el HTML. Si por lo que sea este
 * efecto no corre (JS deshabilitado, un error antes de montar), las
 * páginas se ven completas y quietas, nunca invisibles. Por el mismo
 * motivo las secciones que aparezcan después (el panel de admin
 * re-renderiza el catálogo con cada edición) se registran vía
 * MutationObserver: si algo fallara ahí, esa página simplemente no se
 * anima — no desaparece.
 */
export default function ScrollReveal() {
  const markerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    // La raíz se busca DESDE el propio nodo, no con
    // `document.querySelector`: la vista previa del panel dibuja este
    // mismo árbol dentro de un <iframe> vía portal, y ahí `document` y
    // `window` siguen siendo los de la página de afuera — buscar por
    // `document` no encontraba nada y la vista previa se quedaba sin
    // animación. Con el nodo en la mano se llega al documento correcto
    // (`ownerDocument`) y, sobre todo, a SU ventana: un
    // IntersectionObserver creado con el `window` de afuera mediría
    // contra la pantalla de afuera, no contra el scroll del iframe.
    const marker = markerRef.current;
    const root = marker?.closest<HTMLElement>(".catalog-root");
    const view = marker?.ownerDocument.defaultView;
    if (!root || !view) return;

    // Al terminar la entrada se marca la sección como "asentada" y se
    // le quita la transición (ver `anim-done` en app/globals.css). Dos
    // motivos: el navegador deja de mantener viva la capa de
    // composición que usa mientras anima —que es lo que puede hacer
    // que un texto claro sobre foto se vea apenas más apagado después
    // de animar— y el estado final queda igual de "quieto" que si la
    // animación no existiera.
    const settleTimers = new Map<Element, ReturnType<typeof setTimeout>>();
    const SETTLE_MS = 1600;

    const io = new view.IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const el = entry.target;
          const timer = settleTimers.get(el);
          if (timer) {
            clearTimeout(timer);
            settleTimers.delete(el);
          }

          if (entry.isIntersecting) {
            el.classList.add("in-view");
            settleTimers.set(
              el,
              setTimeout(() => el.classList.add("anim-done"), SETTLE_MS)
            );
          } else {
            // Se sacan las dos juntas: si quedara `anim-done`, la
            // próxima entrada no tendría transición y aparecería de
            // golpe.
            el.classList.remove("in-view", "anim-done");
          }
        });
      },
      // Umbral alto a propósito: la animación arranca recién cuando la
      // página ocupa más de la mitad de la pantalla, o sea cuando ya se
      // la está viendo llegar. Con un umbral bajo (asoma un 4% por el
      // borde) la entrada terminaba ANTES de que la página llegara a su
      // lugar: bajando se alcanzaba a ver algo, pero subiendo no se veía
      // nada, que es exactamente lo que se reportó. Como cada página
      // ocupa una pantalla entera y el scroll va calzando de a una
      // (scroll-snap), este umbral se cruza siempre cerca del final del
      // gesto, en los dos sentidos.
      { threshold: 0.55 }
    );

    const register = (section: Element) => {
      if (section.classList.contains("page-anim")) return;
      section.classList.add("page-anim");
      io.observe(section);
    };

    const registerAll = () => root.querySelectorAll("section.page").forEach(register);
    registerAll();

    const mo = new view.MutationObserver(registerAll);
    mo.observe(root, { childList: true });

    return () => {
      mo.disconnect();
      io.disconnect();
      settleTimers.forEach((t) => clearTimeout(t));
      root.querySelectorAll("section.page").forEach((s) => {
        s.classList.remove("page-anim", "in-view", "anim-done");
      });
    };
  }, []);

  // Nodo mínimo y sin presencia visual: existe solo para poder ubicar
  // el documento y la raíz reales desde el efecto (ver arriba).
  return <span ref={markerRef} hidden aria-hidden="true" />;
}
