import type { Metadata } from "next";
import "./globals.css";

// Los enlaces relativos de `openGraph.images` (ver app/catalog/[id]/page.tsx)
// necesitan resolverse contra una URL absoluta para que WhatsApp/Twitter/etc.
// puedan descargar la imagen al armar la vista previa del link — sin esto,
// Next las deja tal cual (relativas) y el crawler no las encuentra.
// `VERCEL_PROJECT_PRODUCTION_URL` lo define Vercel automáticamente en cada
// build; el fallback es el dominio real de producción, para que funcione
// igual si se corre localmente.
const SITE_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "https://page-catalogo.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Catálogo Digital",
    template: "Catálogo Digital — %s",
  },
  description: "Catálogos digitales interactivos con descarga en PDF.",
  openGraph: {
    title: "Catálogo Digital",
    description: "Catálogos digitales interactivos con descarga en PDF.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
