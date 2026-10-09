/**
 * components/ProtectedImage.tsx
 * Muestra una imagen que vive en el servidor detrás de autenticación.
 *
 * Las fotos ya no viajan en base64 dentro del registro: se piden por URL.
 * Como <img src> no manda la cabecera Authorization, hay que descargarlas
 * con fetch y convertirlas en un blob local.
 *
 * Acepta también base64 y URLs públicas, para que siga funcionando lo que
 * se acaba de capturar en el dispositivo y aún no se ha enviado.
 */
import React, { useEffect, useState } from 'react';
import { fetchProtectedImage } from '../services/api';

interface Props {
  path?: string | null;
  alt?: string;
  className?: string;
  /** Miniatura: mucho más ligera, para listados y mapas. */
  thumb?: boolean;
  fallback?: React.ReactNode;
}

const isDirect = (p: string) =>
  p.startsWith('data:') || p.startsWith('blob:') || p.startsWith('http');

const ProtectedImage: React.FC<Props> = ({
  path, alt = '', className = '', thumb = false, fallback = null,
}) => {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;

    if (!path) { setSrc(null); return; }

    // Lo capturado en el dispositivo se pinta tal cual, sin pedir nada.
    if (isDirect(path)) { setSrc(path); return; }

    const url = thumb && !path.includes('size=')
      ? `${path}${path.includes('?') ? '&' : '?'}size=thumb`
      : path;

    setSrc(null);
    setFailed(false);

    fetchProtectedImage(url).then(objectUrl => {
      if (cancelled) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        return;
      }
      if (objectUrl) { revoked = objectUrl; setSrc(objectUrl); }
      else setFailed(true);
    });

    return () => {
      cancelled = true;
      // Liberar el blob evita que la memoria crezca al pasar páginas.
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [path, thumb]);

  if (!path || failed) return <>{fallback}</>;

  if (!src) {
    return (
      <div className={`${className} bg-slate-100 animate-pulse`} aria-label="Cargando imagen" />
    );
  }

  return <img src={src} alt={alt} className={className} loading="lazy" />;
};

export default ProtectedImage;
