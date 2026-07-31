"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Renderiza `children` dentro de un <iframe> angosto, para previsualizar
 * el catálogo tal como se ve en un celular.
 *
 * Por qué un iframe y no un simple <div> de 390px: las media queries de
 * app/globals.css (`@media (max-width: 850px)`, que es la que cambia el
 * reparto del collage, el tamaño de los títulos, etc.) responden al
 * ancho del **viewport**, no al del contenedor. Un div angosto mostraría
 * el diseño de escritorio comprimido — parecido a un celular pero
 * distinto del real, que es la peor clase de vista previa: una que
 * miente sin avisar. Un iframe tiene su propio viewport, así que las
 * media queries, `100svh` y el scroll-snap se resuelven de verdad contra
 * los 390px.
 *
 * Se portalea el árbol de React adentro del iframe en vez de cargar una
 * URL: así sigue siendo el mismo `CatalogRenderer` con el estado en vivo
 * y sin guardar del editor, igual que el fondo de escritorio. Cargar
 * /catalog/<id> mostraría lo último publicado, que es justo lo que no
 * se quiere ver mientras se edita.
 */
/**
 * Medidas lógicas reales de un iPhone 15 (no 390x844, que es el 14).
 * El ancho tiene que ser exacto porque es lo que define cómo se resuelve
 * el layout adentro; la altura, porque de ella sale la proporción.
 */
const PHONE_W = 393;
const PHONE_H = 852;
const BEZEL = 12; // borde de la carcasa, por lado

export default function MobileFrame({ children }: { children: ReactNode }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);

  /**
   * Si la ventana es más baja que el teléfono, se ESCALA el conjunto en
   * vez de recortarle la altura al iframe. Recortarla era lo que hacía
   * que se viera más ancho de lo que es un iPhone real: el ancho seguía
   * en su valor completo mientras la altura se achicaba, o sea la
   * proporción se deformaba.
   *
   * Con `transform: scale` el iframe sigue midiendo 393x852 por dentro
   * — las media queries y el texto se resuelven exactamente como en el
   * teléfono real — y solo se dibuja más chico. Es lo mismo que hace el
   * modo dispositivo de las DevTools, y por eso no se puede hacer con
   * `zoom`, que sí alteraría el viewport interno.
   */
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const deviceW = PHONE_W + BEZEL * 2;
    const deviceH = PHONE_H + BEZEL * 2;

    const fit = () => {
      const parent = stage.parentElement;
      // `clientHeight` INCLUYE el padding del contenedor, así que usarlo
      // tal cual daba un alto disponible mayor que el real y el teléfono
      // terminaba cortado arriba y abajo (se veía en pantalla aunque las
      // medidas del iframe dieran bien). Hay que descontar el padding
      // para quedarse con la caja de contenido.
      const styles = parent ? getComputedStyle(parent) : null;
      const padding = styles
        ? parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom)
        : 0;
      const available = (parent?.clientHeight ?? window.innerHeight) - padding;
      const scale = Math.min(1, available / deviceH);
      stage.style.setProperty("--phone-scale", String(scale));
      stage.style.width = `${deviceW * scale}px`;
      stage.style.height = `${deviceH * scale}px`;
    };

    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;

    // El iframe arranca con un documento vacío: hay que llevarle los
    // estilos de la página madre (Next los inyecta como <style> en dev y
    // como <link> en producción, así que se copian ambos) o el catálogo
    // se vería sin ningún CSS.
    doc.head.replaceChildren(
      ...Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).map((node) =>
        node.cloneNode(true)
      )
    );
    doc.documentElement.lang = "es";
    doc.body.style.margin = "0";

    // Ocultar la barra de scroll adentro del teléfono: un celular no
    // muestra una, y verla rompe la ilusión. Solo se oculta, el scroll
    // sigue funcionando igual (rueda, trackpad, arrastre).
    const hideScrollbar = doc.createElement("style");
    hideScrollbar.textContent = `
      html { scrollbar-width: none; -ms-overflow-style: none; }
      html::-webkit-scrollbar, body::-webkit-scrollbar { width: 0; height: 0; display: none; }
    `;
    doc.head.appendChild(hideScrollbar);

    setBody(doc.body);
  }, []);

  return (
    <div className="admin-mobile-stage" ref={stageRef}>
      <div className="admin-mobile-device">
        <iframe ref={frameRef} className="admin-mobile-frame" title="Vista móvil del catálogo">
          {/* el contenido entra por el portal de abajo, no como hijos del iframe */}
        </iframe>
        {/* Isla dinámica: decorativa, dibujada en el documento padre por
            encima del iframe (adentro no llegaría, es otro documento).
            aria-hidden porque no aporta nada a un lector de pantalla. */}
        <div className="admin-mobile-island" aria-hidden="true" />
      </div>
      {body && createPortal(children, body)}
    </div>
  );
}
