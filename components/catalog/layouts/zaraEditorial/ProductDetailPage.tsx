import Image from "next/image";
import PageNumber from "../../PageNumber";
import SwatchGroup from "../../SwatchGroup";
import type { ProductVariant } from "@/data/schema";
import SoldOutBadge from "../../SoldOutBadge";
import { isVariantSoldOut, soldOutClass } from "../../soldOut";
import "./zaraEditorial.css";

type ProductDetailPageProps = {
  variant: ProductVariant;
};

/**
 * Imagen izquierda 65% / contenido angosto a la derecha, con mucho
 * blanco y tracking amplio — no la grilla + ficha del layout original.
 */
export default function ProductDetailPage({ variant }: ProductDetailPageProps) {
  // Antes esto era `[hero, secondary]`: de la tercera foto en adelante
  // NO se renderizaba ninguna, así que agregarlas desde el panel no
  // producía ningún cambio visible (y en celular la segunda tampoco, la
  // escondía el CSS). Ahora la primera es la foto grande y TODAS las
  // demás entran en la fila de miniaturas, sin tope.
  const [hero, ...rest] = variant.collageImages;

  return (
    <section className={`page layout-zara-editorial za-detail${soldOutClass(variant)}`} id={variant.id}>
      {isVariantSoldOut(variant) && <SoldOutBadge />}
      <div className="za-detail-image">
        {hero && <Image src={hero.src} alt={hero.alt} fill sizes="(max-width: 850px) 100vw, 65vw" style={{ objectFit: "cover" }} />}
      </div>

      <div className="za-detail-content">
        <h3>{variant.name}</h3>
        <p className="za-detail-type">{variant.type}</p>

        <div className="za-detail-desc">
          {variant.description.map((line, i) => (
            <p key={`${line}-${i}`}>{line}</p>
          ))}
        </div>

        {/* Colores y fotos extra comparten fila en celular: son las dos
            tiras chicas de la ficha, y juntarlas devuelve ~60px de alto
            a la foto grande, que es lo que se quiere ver. */}
        <div className="za-detail-mini">
          <SwatchGroup swatches={variant.swatches} />

          {rest.length > 0 && (
            <div className="za-detail-thumbs">
              {rest.map((img, i) => (
                <div className="za-detail-thumb" key={`${img.src}-${i}`}>
                  <Image src={img.src} alt={img.alt} fill sizes="120px" style={{ objectFit: "cover" }} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="za-detail-price">
          <span>Precio</span>
          {variant.price}
        </div>
      </div>

      <PageNumber n={variant.pageNumber} dark />
    </section>
  );
}
