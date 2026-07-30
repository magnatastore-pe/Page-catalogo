import type { NextConfig } from "next";

/**
 * Hostname del Blob store propio, derivado del token en vez de escrito a
 * mano (auditoría 2026-07-30, S6). El token tiene el formato
 * `vercel_blob_rw_<storeId>_<secreto>`, y el host público de ese store es
 * `<storeId en minúsculas>.public.blob.vercel-storage.com`.
 *
 * Derivarlo importa porque este repo se despliega desde más de un
 * proyecto de Vercel (personal y el de la tienda), y cada uno tiene su
 * propio Blob store con su propio hostname. Un valor hardcodeado sería
 * correcto en uno y rompería TODAS las imágenes subidas en el otro, en
 * silencio y solo en producción. Así cada despliegue autoriza exactamente
 * su propio store, sin que nadie tenga que acordarse de sincronizar nada.
 */
const ANY_BLOB_HOST = "**.public.blob.vercel-storage.com";

function ownBlobHostname(): string | null {
  // BLOB_STORE_ID también sirve y es lo que Vercel expone en algunos
  // contextos; se acepta cualquiera de los dos para no depender de una
  // sola variable.
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const storeId =
    token?.match(/^vercel_blob_rw_([^_]+)_/)?.[1] ??
    process.env.BLOB_STORE_ID?.replace(/^store_/, "");
  return storeId ? `${storeId.toLowerCase()}.public.blob.vercel-storage.com` : null;
}

const ownHost = ownBlobHostname();

/**
 * Si no se puede determinar el store propio, se cae al comodín en vez de
 * dejar `remotePatterns` vacío.
 *
 * Esto se aprendió rompiendo producción: al conectar un Blob store por
 * primera vez, el deploy que ya estaba corriendo se había construido
 * ANTES de que existiera la variable, y como el hostname se resuelve en
 * build time quedó sin ningún patrón permitido. Resultado: /_next/image
 * devolvía 400 para TODAS las fotos subidas, que en el catálogo se ven
 * como secciones negras (la foto no carga y queda solo el degradado
 * oscuro encima). Las fotos estaban perfectas; el optimizador las
 * rechazaba.
 *
 * El comodín tiene un costo real —cualquier Blob store del mundo puede
 * pasar por este optimizador, que es justo lo que S6 vino a cerrar— pero
 * es un costo de cuota, acotado y solo en estado mal configurado. Un
 * sitio con todas las imágenes rotas es peor. Con el token presente (el
 * caso normal) se sigue usando el patrón estricto de un solo host.
 */
const blobPatterns = ownHost ? [ownHost] : [ANY_BLOB_HOST];

if (!ownHost) {
  console.warn(
    "[next.config] No se pudo determinar el Blob store propio " +
      "(falta BLOB_READ_WRITE_TOKEN / BLOB_STORE_ID, o tienen un formato inesperado).\n" +
      "[next.config] Se permite cualquier *.public.blob.vercel-storage.com como respaldo. " +
      "Conectá el store al proyecto en Vercel y volvé a desplegar para restringirlo."
  );
}

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    // Fotos subidas desde el panel (fix de velocidad: van a Vercel Blob
    // en vez de un commit a GitHub) se sirven desde este dominio —
    // next/image necesita el hostname en la lista para poder
    // optimizarlas igual que las que ya viven en public/imagenes/.
    //
    // Solo el store propio siempre que se pueda determinar, NO
    // `**.public.blob.vercel-storage.com` (auditoría 2026-07-30, S6): el
    // comodín habilitaba cualquier store de Blob del mundo, convirtiendo
    // /_next/image en un optimizador abierto para imágenes de terceros a
    // costa de la cuota de este proyecto. Ver arriba el porqué del
    // respaldo cuando no hay token.
    remotePatterns: blobPatterns.map((hostname) => ({ protocol: "https" as const, hostname })),
  },
  /**
   * Cabeceras de seguridad (auditoría 2026-07-30, S5): en producción la
   * única que llegaba era `strict-transport-security`, puesta por Vercel.
   * Sin `X-Frame-Options`, /admin/login era enmarcable desde cualquier
   * origen — clickjacking sobre el formulario de login, que es el único
   * formulario sensible del sitio.
   *
   * A propósito NO se agrega todavía un `Content-Security-Policy`
   * completo: los scripts de Google Drive (apis.google.com,
   * accounts.google.com) se cargan en runtime desde el panel, y una CSP
   * mal calibrada rompería la importación sin que nada lo detecte en
   * build. Estas tres son las que no tienen contrapartida.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
  experimental: {
    serverActions: {
      // El default (1MB) queda corto para subir fotos por el panel de
      // administración (Fase 8): el contenido viaja en base64, que
      // infla ~33% el tamaño del archivo original.
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
