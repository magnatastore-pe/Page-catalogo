"use client";

import { useState } from "react";
import Image from "next/image";
import { useAssets } from "./AssetsContext";
import AssetGallery from "./AssetGallery";

type ImagePickerProps = {
  /** Si se omite, no dibuja su propio <label> — para cuando ya vive dentro de un grupo con label propio (ej. una fila de CollageImagesEditor). */
  label?: string;
  value: string;
  onChange: (value: string) => void;
};

/**
 * Campo de imagen con tres formas de completarlo: escribir la ruta a
 * mano (se mantiene por flexibilidad), elegir una ya subida de la
 * galería, o subir una nueva ahí mismo. La grilla/subida en sí vive en
 * AssetGallery (compartida con la futura pestaña "Imágenes" del
 * panel) — acá solo queda lo específico de ser un campo de un
 * formulario: el modal abrir/cerrar y el aviso de "recién subida".
 */
export default function ImagePicker({ label, value, onChange }: ImagePickerProps) {
  const { assets } = useAssets();
  const [open, setOpen] = useState(false);
  const [justUploaded, setJustUploaded] = useState(false);

  const currentPreview = assets.find((a) => a.path === value)?.previewUrl;

  return (
    <div className="admin-field admin-image-picker">
      {label && <label>{label}</label>}
      <div className="admin-image-picker-row">
        {value && (
          <div className="admin-image-picker-preview">
            {/* Igual que en la galería: la miniatura de 40px pasa por
                el optimizador salvo que sea una subida de esta sesión
                (blob: URL local, que el optimizador no puede tomar). */}
            {currentPreview ? (
              // eslint-disable-next-line @next/next/no-img-element -- blob: URL local
              <img src={currentPreview} alt="" />
            ) : (
              <Image src={value} alt="" width={168} height={128} />
            )}
          </div>
        )}
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="admin-btn" onClick={() => setOpen(true)}>
          Elegir
        </button>
      </div>
      {justUploaded && (
        <p className="admin-image-picker-note">
          Subida y comiteada. Va a verse en el sitio recién después del próximo deploy — hasta entonces la vista previa acá usa una copia local.
        </p>
      )}

      {open && (
        <div className="admin-gallery-overlay" onClick={() => setOpen(false)}>
          <div className="admin-gallery" onClick={(e) => e.stopPropagation()}>
            <div className="admin-gallery-header">
              <p>Elegir imagen</p>
              <button type="button" className="admin-btn admin-btn-icon" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>

            <AssetGallery
              selectedPath={value}
              onPick={(path) => {
                onChange(path);
                setOpen(false);
              }}
              onUploaded={(path, hadFailures) => {
                onChange(path);
                setJustUploaded(true);
                // Si alguna foto de la tanda falló, la ventana se queda
                // abierta: cerrarla se llevaba puesto el mensaje que
                // dice cuál falló y por qué.
                if (!hadFailures) setOpen(false);
              }}
              onUploadStart={() => setJustUploaded(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
