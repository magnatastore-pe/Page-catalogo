import Image from "next/image";
import Link from "next/link";
import { catalogs } from "@/data/catalogs";
import type { Block, CatalogBlocks } from "@/data/schema";

function getCoverBlock(blocks: CatalogBlocks) {
  return blocks.find((b): b is Extract<Block, { type: "cover" }> => b.type === "cover");
}

/**
 * Índice de catálogos disponibles: una tarjeta por catálogo del
 * registro (data/catalogs/index.ts), usando su propio bloque "cover"
 * para el título/imagen — no hay un segundo lugar donde mantener esos
 * datos al día. Cada tarjeta linkea a /catalog/[id], que sí es la URL
 * pensada para compartir un catálogo puntual.
 */
export default function HomePage() {
  const entries = Object.entries(catalogs);

  return (
    <main className="catalog-index">
      <Link href="/admin" className="catalog-index-admin-link">
        Admin
      </Link>
      <div className="catalog-index-header">
        <p>Catálogos</p>
      </div>
      <div className="catalog-index-grid">
        {entries.map(([id, entry]) => {
          const cover = getCoverBlock(entry.blocks);
          if (!cover) return null;
          return (
            <Link key={id} href={`/catalog/${id}`} className="catalog-index-card">
              <Image
                src={cover.data.bgImage}
                alt=""
                fill
                sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 33vw"
                style={{ objectFit: "cover" }}
              />
              <div className="catalog-index-card-overlay">
                <h2>{cover.data.title}</h2>
                <span>{cover.data.subtitle}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
