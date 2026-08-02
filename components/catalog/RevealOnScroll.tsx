"use client";

import { useEffect, useRef, type ReactNode } from "react";

type RevealOnScrollProps = {
  children: ReactNode;
  className?: string;
  /** Retraso en ms antes de iniciar la transición, para escalonar varios bloques. */
  delay?: number;
};

/**
 * Envuelve contenido que debe aparecer con fade-in al entrar en viewport.
 * Reemplaza el IntersectionObserver global que antes vivía en un <script> suelto.
 *
 * La animación se repite cada vez que la sección entra en pantalla, no
 * solo la primera: al salir del viewport el elemento vuelve a su estado
 * inicial, así que subir y bajar por el catálogo lo vuelve a mostrar
 * apareciendo. Antes se hacía `unobserve` en el primer cruce (una sola
 * vez por carga).
 *
 * Nota para el PDF: `scripts/generate-pdf.mjs` recorre toda la página
 * antes de imprimir, y con esto las secciones que quedaron atrás vuelven
 * a `opacity: 0` — por eso `@media print` (app/globals.css) fuerza
 * `.reveal` visible, en vez de depender del estado de la clase.
 */
export default function RevealOnScroll({ children, className = "", delay }: RevealOnScrollProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          el.classList.toggle("visible", entry.isIntersecting);
        });
      },
      { threshold: 0.12 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${className}`.trim()}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
