"use client";

/**
 * Glosario del panel: qué quiere decir cada palabra que aparece en los
 * formularios. El panel usa vocabulario editorial (colorway, manifiesto,
 * collage, swatch) que es preciso pero no obvio para alguien que solo
 * quiere cargar su catálogo — esta pestaña existe para no tener que
 * adivinarlo.
 *
 * Es contenido, no lógica: se define acá como datos y se dibuja de una
 * sola forma, para poder agregar términos sin tocar JSX.
 */

type Term = {
  term: string;
  short: string;
  detail?: string;
};

const TERMS: Term[] = [
  {
    term: "Catálogo",
    short: "Todo el conjunto: la portada, las páginas y sus colores.",
    detail: "Cada catálogo tiene su propia dirección web (/catalog/su-nombre) y su propio PDF.",
  },
  {
    term: "Página",
    short: "Cada pantalla completa del catálogo, de arriba a abajo.",
    detail: "El visitante ve una por vez: al bajar, la siguiente se acomoda sola en la pantalla.",
  },
  {
    term: "Portada",
    short: "La primera página: la foto grande con el nombre de la colección.",
  },
  {
    term: "Manifiesto",
    short: "Página de texto sobre una foto: la idea o el concepto de la colección.",
    detail: "Suele ir después de la portada. Es el único lugar pensado para un párrafo largo.",
  },
  {
    term: "Hero de producto",
    short: "Página de presentación del producto principal, con su nombre y tipo sobre una foto.",
  },
  {
    term: "Colorway",
    short: "Una versión de color del mismo producto (por ejemplo: el mismo vestido en marfil y en verde).",
    detail:
      "Cada colorway ocupa DOS páginas: primero el capítulo (foto de transición) y después el detalle (fotos, colores y precio). El panel las muestra juntas como una sola tarjeta.",
  },
  {
    term: "Capítulo",
    short: "La primera de las dos páginas de un colorway: foto a pantalla completa que anuncia el color.",
  },
  {
    term: "Detalle",
    short: "La segunda página de un colorway: el collage de fotos, la descripción, los colores y el precio.",
  },
  {
    term: "Collage",
    short: "La grilla de fotos de la página de detalle.",
    detail:
      "La forma de la grilla se arma sola según cuántas fotos pongas: 1, 2, 3 o 4. Poner más de 4 no agrega nada — solo se muestran las primeras 4.",
  },
  {
    term: "Swatch",
    short: "El cuadradito de color de la página de detalle, con el nombre del color al lado.",
    detail: "Puede ser una foto recortada de la tela o un color liso, si no hay una buena foto de cerca.",
  },
  {
    term: "Cierre",
    short: "La última página: el agradecimiento o la frase final, y el enlace para descargar el PDF.",
  },
  {
    term: "Plantilla",
    short: "El diseño visual completo del catálogo: composición de las páginas, tipografías y decoración.",
    detail:
      "Se elige al crear el catálogo y después no se cambia: el contenido ya cargado puede no calzar con los supuestos de otro diseño (por ejemplo, una plantilla de una sola foto por colorway contra otra de cuatro).",
  },
  {
    term: "Tema",
    short: "Los 5 colores y las 2 tipografías del catálogo (pestaña Colores).",
    detail:
      "Se ven sobre todo en la página de detalle. Las páginas que son foto a pantalla completa llevan texto blanco por diseño — para cambiar el color de uno de esos textos, clickealo directamente en la vista previa.",
  },
  {
    term: "Tinta / Papel",
    short: "Tinta es el color del texto principal; papel es el color de fondo de las zonas claras.",
  },
  {
    term: "Acento",
    short: "El color de los detalles: la barra de progreso al bajar y los remarques del diseño.",
  },
  {
    term: "Guardar y publicar",
    short: "Guarda los cambios y los sube al sitio real.",
    detail:
      "No es instantáneo: el sitio se vuelve a construir solo y el cambio se ve en 1 o 2 minutos. Lo mismo pasa con una foto recién subida.",
  },
  {
    term: "Vista previa",
    short: "El catálogo que se ve detrás del panel: es el de verdad, con los cambios que todavía no guardaste.",
    detail:
      "El botón Escritorio/Móvil cambia cómo se simula. Clickear un texto ahí abre el selector de color de ese texto.",
  },
  {
    term: "Imagen sin usar",
    short: "Una foto de la biblioteca que ninguna página de ningún catálogo está usando.",
    detail: "Son las únicas que se pueden borrar, justamente para no romper un catálogo publicado.",
  },
];

export default function Glossary() {
  return (
    <div className="admin-glossary">
      <p className="admin-page-detail-hint">
        Qué quiere decir cada palabra que usa el panel. Si algo no está acá y no se entiende, se puede agregar.
      </p>
      <dl>
        {TERMS.map((t) => (
          <div className="admin-glossary-item" key={t.term}>
            <dt>{t.term}</dt>
            <dd>
              {t.short}
              {t.detail && <span className="admin-glossary-detail">{t.detail}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
