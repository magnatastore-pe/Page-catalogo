import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    // Fotos subidas desde el panel (fix de velocidad: van a Vercel Blob
    // en vez de un commit a GitHub) se sirven desde este dominio —
    // next/image necesita el hostname en la lista para poder
    // optimizarlas igual que las que ya viven en public/imagenes/.
    remotePatterns: [{ protocol: "https", hostname: "**.public.blob.vercel-storage.com" }],
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
