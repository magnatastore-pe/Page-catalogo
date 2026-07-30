import { requireSession } from "@/lib/session";
import { catalogs } from "@/data/catalogs";
import type { Block, CatalogBlocks } from "@/data/schema";
import { listAssets, listUsedAssetPaths } from "@/lib/assets";
import { listDriveLinks } from "@/lib/driveLinks";
import LogoutButton from "@/components/admin/LogoutButton";
import CreateCatalogWizard from "@/components/admin/wizard/CreateCatalogWizard";
import CatalogList from "@/components/admin/CatalogList";
import { AssetsProvider } from "@/components/admin/AssetsContext";

function getCoverBlock(blocks: CatalogBlocks) {
  return blocks.find((b): b is Extract<Block, { type: "cover" }> => b.type === "cover");
}

/**
 * Índice de catálogos del panel: uno por entrada del registro
 * (data/catalogs/index.ts), cada uno linkeando a su propio editor en
 * /admin/[id] — antes /admin era directamente el editor de Ariel, el
 * único catálogo que existía; ahora que el panel puede crear/eliminar
 * más, hace falta un punto de entrada que liste todos.
 */
export default async function AdminPage() {
  await requireSession();
  const items = Object.entries(catalogs).map(([id, entry]) => ({
    id,
    title: getCoverBlock(entry.blocks)?.data.title || id,
    blockCount: entry.blocks.length,
  }));
  // El wizard reusa BlockForm (Paso 3), que usa ImagePicker por dentro
  // — antes de esto /admin nunca necesitó AssetsProvider porque
  // AddCatalogForm no tenía ningún campo de imagen.
  const assets = await listAssets();
  const driveLinks = await listDriveLinks();
  const usedPaths = [...listUsedAssetPaths()];

  return (
    <AssetsProvider initialAssets={assets} initialDriveLinks={driveLinks} usedPaths={usedPaths}>
      <header className="admin-header">
        <h1>Panel de administración</h1>
        <div className="admin-header-actions">
          <LogoutButton />
        </div>
      </header>
      <main className="admin-main">
        <CatalogList catalogs={items} />
        <CreateCatalogWizard />
      </main>
    </AssetsProvider>
  );
}
