import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { catalogs, type CatalogId } from "@/data/catalogs";
import { listAssets, listUsedAssetPaths } from "@/lib/assets";
import { listDriveLinks } from "@/lib/driveLinks";
import AdminEditor from "@/components/admin/AdminEditor";
import LogoutButton from "@/components/admin/LogoutButton";
import { AssetsProvider } from "@/components/admin/AssetsContext";

type AdminCatalogPageProps = {
  params: Promise<{ id: string }>;
};

/** Editor de un catálogo puntual — la misma pieza que antes vivía fija en /admin, ahora parametrizada por id. */
export default async function AdminCatalogPage({ params }: AdminCatalogPageProps) {
  await requireSession();
  const { id } = await params;

  if (!(id in catalogs)) {
    notFound();
  }

  const entry = catalogs[id as CatalogId];
  const assets = await listAssets();
  const driveLinks = await listDriveLinks();
  const usedPaths = [...listUsedAssetPaths()];

  return (
    <AssetsProvider initialAssets={assets} initialDriveLinks={driveLinks} usedPaths={usedPaths}>
      <AdminEditor
        catalogId={id}
        initialBlocks={entry.blocks}
        initialTheme={entry.theme}
        layoutId={entry.layoutId}
        topbarActions={
          <>
            <Link href="/admin" className="admin-btn">
              ← Catálogos
            </Link>
            <LogoutButton />
          </>
        }
      />
    </AssetsProvider>
  );
}
