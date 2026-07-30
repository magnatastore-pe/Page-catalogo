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
function ownBlobHostname(): string | null {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const storeId = token?.match(/^vercel_blob_rw_([^_]+)_/)?.[1];
  return storeId ? `${storeId.toLowerCase()}.public.blob.vercel-storage.com` : null;
}

const blobHostname = ownBlobHostname();

if (!blobHostname) {
  // No se aborta el build: el sitio público se sirve entero desde
  // public/imagenes/, así que sin Blob configurado igual funciona. Pero
  // sí se avisa fuerte, porque una foto subida desde el panel no se va a
  // poder optimizar y eso solo se notaría mirando el sitio.
  console.warn(
    "[next.config] BLOB_READ_WRITE_TOKEN ausente o con formato inesperado: " +
      "las imágenes servidas desde Vercel Blob no van a poder optimizarse."
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
    // Solo el store propio, NO `**.public.blob.vercel-storage.com`
    // (auditoría 2026-07-30, S6): el comodín habilitaba cualquier store de
    // Blob del mundo, convirtiendo /_next/image en un optimizador abierto
    // para imágenes de terceros a costa de la cuota de este proyecto.
    remotePatterns: blobHostname
      ? [{ protocol: "https" as const, hostname: blobHostname }]
      : [],
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
