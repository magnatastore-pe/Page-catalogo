"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Renderiza `children` dentro de un <iframe> con el tamaño lógico de un
 * dispositivo real, metido en una carcasa dibujada (teléfono o monitor)
 * con su barra de navegador simulada.
 *
 * Por qué un iframe y no un simple <div> angosto: las media queries de
 * app/globals.css (`@media (max-width: 850px)`, la que cambia el reparto
 * del collage, el tamaño de los títulos, etc.) responden al ancho del
 * **viewport**, no al del contenedor. Un div angosto mostraría el diseño
 * de escritorio comprimido — parecido a un celular pero distinto del
 * real, que es la peor clase de vista previa: una que miente sin avisar.
 * Un iframe tiene su propio viewport, así que las media queries,
 * `100svh` y el scroll-snap se resuelven de verdad contra sus medidas.
 *
 * Se portalea el árbol de React adentro del iframe en vez de cargar una
 * URL: así sigue siendo el mismo `CatalogRenderer` con el estado en vivo
 * y sin guardar del editor. Cargar /catalog/<id> mostraría lo último
 * publicado, que es justo lo que no se quiere ver mientras se edita.
 *
 * Antes esto era `MobileFrame` y solo existía la variante teléfono; el
 * escritorio se dibujaba a sangre completa contra la ventana real. Ahora
 * las dos vistas pasan por acá — una sola implementación de "pantalla
 * simulada", con la carcasa como única diferencia.
 */

type Variant = "phone" | "desktop";

type VariantSpec = {
  /** Medidas lógicas de la PANTALLA (incluida la barra del navegador simulada). */
  width: number;
  height: number;
  /** Alto que se lleva la barra del navegador simulada, descontado del viewport del iframe. */
  chrome: number;
};

/**
 * Teléfono: medidas lógicas reales de un iPhone 15 (no 390x844, que es
 * el 14). Escritorio: un portátil común de 1440x900. El ancho tiene que
 * ser exacto porque es lo que define cómo se resuelve el layout adentro.
 *
 * `chrome` sale de navegadores reales: en el teléfono, barra de estado
 * (~44) + barra de dirección (~48); en el escritorio, la barra de
 * pestañas/dirección de la ventana. Descontarlo del alto del iframe es
 * lo que hace que la vista previa sea honesta: el catálogo usa `100svh`
 * por página, así que ver "una página entera" tiene que significar lo
 * mismo acá que en el navegador de verdad, donde el chrome se come esos
 * píxeles.
 */
const SPECS: Record<Variant, VariantSpec> = {
  phone: { width: 393, height: 852, chrome: 92 },
  desktop: { width: 1440, height: 900, chrome: 44 },
};

type PreviewFrameProps = {
  variant: Variant;
  /** Texto que se muestra en la barra de dirección simulada. Decorativo. */
  url: string;
  /** Se llama con el `document` del iframe cuando ya está listo (y con `null` al desmontarlo) — lo usa AdminPanel para escuchar clicks sobre el catálogo. */
  onDocumentReady?: (doc: Document | null) => void;
  children: ReactNode;
};

export default function PreviewFrame({ variant, url, onDocumentReady, children }: PreviewFrameProps) {
  const spec = SPECS[variant];
  const frameRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const deviceRef = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);

  /**
   * Si el espacio disponible es más chico que el dispositivo, se ESCALA
   * el conjunto en vez de recortarlo. Con `transform: scale` el iframe
   * sigue midiendo por dentro lo que dice `spec` — las media queries y
   * el texto se resuelven exactamente como en el dispositivo real — y
   * solo se dibuja más chico. Es lo mismo que hace el modo dispositivo
   * de las DevTools, y por eso no se puede usar `zoom`, que sí
   * alteraría el viewport interno.
   */
  useEffect(() => {
    const stage = stageRef.current;
    const device = deviceRef.current;
    if (!stage || !device) return;

    const fit = () => {
      const parent = stage.parentElement;
      // `clientWidth/Height` INCLUYEN el padding del contenedor, así que
      // usarlos tal cual da un espacio disponible mayor que el real y el
      // dispositivo termina cortado. Hay que descontar el padding para
      // quedarse con la caja de contenido.
      const styles = parent ? getComputedStyle(parent) : null;
      const padX = styles ? parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight) : 0;
      const padY = styles ? parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom) : 0;
      const availW = (parent?.clientWidth ?? window.innerWidth) - padX;
      const availH = (parent?.clientHeight ?? window.innerHeight) - padY;
      // Se mide la carcasa ya dibujada en vez de recalcular marcos y
      // bordes acá: así el CSS puede cambiar el grosor del marco sin que
      // esta cuenta quede desfasada (`offsetWidth` no se ve afectado por
      // el `transform`, a diferencia de getBoundingClientRect()).
      const deviceW = device.offsetWidth;
      const deviceH = device.offsetHeight;
      const scale = Math.min(1, availW / deviceW, availH / deviceH);
      stage.style.setProperty("--frame-scale", String(scale));
      stage.style.width = `${deviceW * scale}px`;
      stage.style.height = `${deviceH * scale}px`;
    };

    fit();
    // El panel de edición se abre/colapsa sin que cambie el tamaño de la
    // ventana, así que escuchar solo `resize` dejaba la escala vieja: el
    // dispositivo quedaba más chico (o cortado) de lo que el espacio
    // realmente permitía. ResizeObserver sobre el contenedor sí lo ve.
    const parent = stage.parentElement;
    const observer = new ResizeObserver(fit);
    if (parent) observer.observe(parent);
    window.addEventListener("resize", fit);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [variant]);

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

    // Ocultar la barra de scroll adentro del dispositivo: ni un celular
    // ni esta maqueta la muestran, y verla rompe la ilusión. Solo se
    // oculta, el scroll sigue funcionando igual (rueda, trackpad,
    // arrastre).
    const hideScrollbar = doc.createElement("style");
    hideScrollbar.textContent = `
      html { scrollbar-width: none; -ms-overflow-style: none; }
      html::-webkit-scrollbar, body::-webkit-scrollbar { width: 0; height: 0; display: none; }
    `;
    doc.head.appendChild(hideScrollbar);

    setBody(doc.body);
    onDocumentReady?.(doc);
    return () => onDocumentReady?.(null);
    // `onDocumentReady` a propósito fuera de las deps: quien la pasa
    // suele hacerlo inline (una función nueva por render), y volver a
    // correr este efecto recrearía el documento del iframe en cada
    // tecla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

  return (
    <div className={`admin-frame-stage admin-frame-stage--${variant}`} ref={stageRef}>
      <div className={`admin-frame-device admin-frame-device--${variant}`} ref={deviceRef}>
        <div className="admin-frame-screen" style={{ width: spec.width, height: spec.height }}>
          {variant === "phone" ? (
            <div className="admin-frame-chrome admin-frame-chrome--phone" aria-hidden="true">
              <div className="admin-frame-statusbar">
                <span>9:41</span>
                <span className="admin-frame-statusbar-icons">▮▮▮ ▮</span>
              </div>
              <div className="admin-frame-urlbar">
                <span className="admin-frame-lock">🔒</span>
                <span className="admin-frame-url">{url}</span>
                <span className="admin-frame-reload">⟳</span>
              </div>
            </div>
          ) : (
            <div className="admin-frame-chrome admin-frame-chrome--desktop" aria-hidden="true">
              <div className="admin-frame-dots">
                <i />
                <i />
                <i />
              </div>
              <div className="admin-frame-urlbar">
                <span className="admin-frame-lock">🔒</span>
                <span className="admin-frame-url">{url}</span>
              </div>
            </div>
          )}
          <iframe
            ref={frameRef}
            className="admin-preview-frame"
            title="Vista previa del catálogo"
            style={{ width: spec.width, height: spec.height - spec.chrome }}
          >
            {/* el contenido entra por el portal de abajo, no como hijos del iframe */}
          </iframe>
        </div>
        {/* Isla dinámica: decorativa, dibujada en el documento padre por
            encima del iframe (adentro no llegaría, es otro documento).
            aria-hidden porque no aporta nada a un lector de pantalla. */}
        {variant === "phone" && <div className="admin-frame-island" aria-hidden="true" />}
      </div>
      {body && createPortal(children, body)}
    </div>
  );
}
