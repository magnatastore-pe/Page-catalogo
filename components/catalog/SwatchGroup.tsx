import Image from "next/image";
import type { SwatchItem } from "@/data/schema";

type SwatchGroupProps = {
  swatches: SwatchItem[];
};

export default function SwatchGroup({ swatches }: SwatchGroupProps) {
  return (
    <div className="swatches">
      {swatches.map((swatch, i) => (
        <div className="swatch" key={`${swatch.label}-${i}`}>
          {swatch.type === "image" ? (
            <Image src={swatch.image} alt={swatch.label} fill sizes="64px" />
          ) : (
            <div className="swatch-color" style={{ backgroundColor: swatch.color }} />
          )}
          <div className="swatch-label">{swatch.label}</div>
        </div>
      ))}
    </div>
  );
}
