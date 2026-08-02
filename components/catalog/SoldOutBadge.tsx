/**
 * Cartel de "agotado" para el modelo entero de una página de detalle.
 *
 * Un solo componente para las 10 plantillas: se posiciona contra la
 * `<section class="page">` (que ya es `position: relative`), así que no
 * depende de la composición interna de ninguna de ellas. El color sale
 * del tema del catálogo, para que se lea igual en una plantilla clara
 * que en una oscura.
 */
export default function SoldOutBadge() {
  return <div className="sold-out-badge">SOLD OUT</div>;
}
