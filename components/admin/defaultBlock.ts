import type { Block } from "@/data/schema";

/**
 * Bloque vacío de cada tipo — usado tanto por AddPageChooser en el
 * editor normal como por el Paso 3 del asistente de creación, para
 * agregar un tipo suelto (manifiesto/hero/cierre) sin repetir esta
 * misma estructura en los dos lugares.
 */
export function defaultBlockFor(type: Block["type"]): Block {
  switch (type) {
    case "cover":
      return {
        type,
        data: {
          title: "",
          meta: [],
          subtitle: "",
          bottomLine1: "",
          bottomLine2: "",
          bgImage: "/imagenes/base-20260731-c6c17dd3.webp",
          pageNumber: 0,
        },
      };
    case "manifesto":
      return { type, data: { heading: "", paragraph: "", bgImage: "/imagenes/base-20260731-c6c17dd3.webp", pageNumber: 0 } };
    case "productHero":
      return { type, data: { id: "", name: "", type: "", bgImage: "/imagenes/base-20260731-c6c17dd3.webp", pageNumber: 0 } };
    case "chapterHero":
      return { type, data: { id: "", pageNumber: 0, name: "", label: "", bgImage: "/imagenes/base-20260731-c6c17dd3.webp" } };
    case "productDetail":
      return {
        type,
        data: {
          id: "",
          pageNumber: 0,
          name: "",
          type: "",
          price: "",
          description: [],
          collageLayout: "two",
          collageImages: [],
          swatches: [],
        },
      };
    case "closing":
      return { type, data: { title: "", line1: "", line2: "", bgImage: "/imagenes/base-20260731-c6c17dd3.webp", pageNumber: 0 } };
  }
}
