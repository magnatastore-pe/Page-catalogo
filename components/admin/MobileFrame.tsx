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
export default function MobileFrame({ children }: { children: ReactNode }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);

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

    setBody(doc.body);
  }, []);

  return (
    <div className="admin-mobile-stage">
      <iframe ref={frameRef} className="admin-mobile-frame" title="Vista móvil del catálogo">
        {/* el contenido entra por el portal de abajo, no como hijos del iframe */}
      </iframe>
      {body && createPortal(children, body)}
    </div>
  );
}
