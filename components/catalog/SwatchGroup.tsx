import Image from "next/image";
import type { SwatchItem } from "@/data/schema";

type SwatchGroupProps = {
  swatches: SwatchItem[];
};

export default function SwatchGroup({ swatches }: SwatchGroupProps) {
  return (
    <div className="swatches">
      {swatches.map((swatch, i) => (
        <div
          className={`swatch${swatch.soldOut ? " swatch-sold-out" : ""}`}
          key={`${swatch.label}-${i}`}
          title={swatch.soldOut ? `${swatch.label} — sold out` : swatch.label}
        >
          {swatch.type === "image" ? (
            <Image src={swatch.image} alt={swatch.label} fill sizes="64px" />
          ) : (
            <div className="swatch-color" style={{ backgroundColor: swatch.color }} />
          )}
          {/* El color agotado necesita un cartel SIEMPRE visible: la
              etiqueta con el nombre (.swatch-label) solo aparece en
              hover/tap, así que no sirve para comunicar un estado. */}
          {swatch.soldOut ? (
            <div className="swatch-soldout-tag">SOLD OUT</div>
          ) : (
            <div className="swatch-label">{swatch.label}</div>
          )}
        </div>
      ))}
    </div>
  );
}
