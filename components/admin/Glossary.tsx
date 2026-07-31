"use client";

/**
 * Glosario del panel: qué es cada cosa y, cuando importa, qué hacer con
 * ella. El panel usa vocabulario editorial (colorway, manifiesto,
 * collage, swatch) que es preciso pero no obvio para alguien que solo
 * quiere cargar su catálogo.
 *
 * Es contenido, no lógica: se define acá como datos y se dibuja de una
 * sola forma, para poder agregar o corregir términos sin tocar JSX.
 * Cada entrada es una línea de qué es y, solo si cambia lo que uno
 * hace, una de qué hacer — no una enciclopedia.
 */

type Term = {
  term: string;
  what: string;
  /** Qué hacer con esto. Solo cuando agrega algo que no se deduce de la definición. */
  tip?: string;
};

type Group = {
  title: string;
  terms: Term[];
};

const GROUPS: Group[] = [
  {
    title: "Las páginas",
    terms: [
      { term: "Página", what: "Cada pantalla completa del catálogo. El visitante ve una por vez." },
      { term: "Portada", what: "La primera: foto grande con el nombre de la colección." },
      {
        term: "Manifiesto",
        what: "Texto sobre una foto: la idea de la colección.",
        tip: "Es la única página pensada para un párrafo largo.",
      },
      { term: "Hero de producto", what: "Presenta el producto principal: nombre y tipo sobre una foto." },
      { term: "Cierre", what: "La última: la frase final y el enlace para descargar el PDF." },
    ],
  },
  {
    title: "Colorways",
    terms: [
      {
        term: "Colorway",
        what: "Una versión de color del mismo producto (el mismo vestido en marfil y en verde).",
        tip: "Ocupa 2 páginas: capítulo + detalle. El panel las edita juntas, en una sola tarjeta.",
      },
      { term: "Capítulo", what: "La primera página del colorway: foto a pantalla completa que anuncia el color." },
      { term: "Detalle", what: "La segunda: collage, descripción, colores y precio." },
      {
        term: "Collage",
        what: "La grilla de fotos de la página de detalle.",
        tip: "La forma se arma sola con 1, 2, 3 o 4 fotos. Más de 4 no se muestran.",
      },
      {
        term: "Swatch",
        what: "El cuadradito de color con su nombre al lado.",
        tip: "Puede ser una foto recortada de la tela o un color liso.",
      },
    ],
  },
  {
    title: "Diseño",
    terms: [
      {
        term: "Plantilla",
        what: "El diseño visual completo: composición, tipografías y decoración.",
        tip: "Se elige al crear el catálogo y no se cambia después.",
      },
      {
        term: "Tema",
        what: "Los 5 colores y las 2 tipografías del catálogo (pestaña Colores).",
        tip: "Se ven en la página de detalle. Las páginas con foto a pantalla completa llevan texto blanco por diseño.",
      },
      { term: "Tinta / Papel", what: "Tinta es el color del texto; papel, el fondo de las zonas claras." },
      { term: "Acento", what: "La barra de progreso que avanza al bajar por el catálogo." },
      {
        term: "Color de un texto suelto",
        what: "Cualquier texto puede tener su propio color, aparte del tema.",
        tip: "Clickealo en la vista previa y elegí el color. El cuadro se cierra solo.",
      },
    ],
  },
  {
    title: "Fotos y publicación",
    terms: [
      {
        term: "Imagen sin usar",
        what: "Una foto que ninguna página de ningún catálogo está usando.",
        tip: "Son las únicas que se pueden borrar, para no romper un catálogo publicado.",
      },
      {
        term: "Vista previa",
        what: "El catálogo de atrás: es el de verdad, con los cambios que todavía no guardaste.",
        tip: "El botón Escritorio/Móvil cambia en qué pantalla se simula.",
      },
      {
        term: "Guardar y publicar",
        what: "Guarda los cambios y los sube al sitio real.",
        tip: "Tarda 1 o 2 minutos en verse. Lo mismo con una foto recién subida.",
      },
    ],
  },
];

export default function Glossary() {
  return (
    <div className="admin-glossary">
      {GROUPS.map((group) => (
        <section key={group.title}>
          <h4 className="admin-glossary-group">{group.title}</h4>
          <dl>
            {group.terms.map((t) => (
              <div className="admin-glossary-item" key={t.term}>
                <dt>{t.term}</dt>
                <dd>
                  {t.what}
                  {t.tip && <span className="admin-glossary-detail">{t.tip}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
