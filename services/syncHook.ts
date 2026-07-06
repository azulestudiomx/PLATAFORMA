import { useEffect, useState } from 'react';
import { reportsApi } from './api';
import { db } from './db';

export const useSyncReports = () => {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Monitor network status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Conteo de pendientes dirigido por eventos (sin polling: ahorra batería).
  // Se recalcula cuando la tabla local cambia, al volver a la app o al reconectar.
  useEffect(() => {
    const updateCount = async () => {
      const count = await db.reports.filter(r => r.synced === false || (r as any).synced === 0).count();
      setPendingCount(count);
    };

    updateCount();

    // Dexie hooks: cualquier alta/edición/borrado local dispara el recálculo
    const onCreating = () => { setTimeout(updateCount, 50); };
    const onUpdating = () => { setTimeout(updateCount, 50); };
    const onDeleting = () => { setTimeout(updateCount, 50); };
    db.reports.hook('creating', onCreating);
    db.reports.hook('updating', onUpdating);
    db.reports.hook('deleting', onDeleting);

    const onVisible = () => { if (!document.hidden) updateCount(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', updateCount);

    return () => {
      db.reports.hook('creating').unsubscribe(onCreating);
      db.reports.hook('updating').unsubscribe(onUpdating);
      db.reports.hook('deleting').unsubscribe(onDeleting);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', updateCount);
    };
  }, []);

  // Automatic Sync Trigger
  useEffect(() => {
    if (isOnline && pendingCount > 0 && !isSyncing) {
      syncReports();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, pendingCount]);

  const syncReports = async () => {
    setIsSyncing(true);
    setSyncError(null);

    try {
      // 1. Get unsynced reports from local Dexie DB
      const unsyncedReports = await db.reports.filter(r => r.synced === false || (r as any).synced === 0).toArray();

      if (unsyncedReports.length === 0) return;

      console.log(` Iniciando sincronización de ${unsyncedReports.length} reportes con el servidor...`);

      // 2. Iterate and send to backend
      for (const report of unsyncedReports) {
        try {
          // Prepare payload (exclude local ID if backend generates its own _id)
          const payload = {
            municipio: report.municipio,
            comunidad: report.comunidad,
            location: report.location,
            needType: report.needType,
            description: report.description,
            evidenceBase64: report.evidenceBase64,
            evidenceGallery: report.evidenceGallery,
            timestamp: report.timestamp,
            user: report.user,
            urgency: report.urgency,
            sentiment: report.sentiment,
            status: report.status || 'Pendiente'
          };

          // Uses centralized API service (includes JWT token automatically)
          await reportsApi.create(payload);


          // 3. Mark as synced locally ONLY if server confirmed receipt
          if (report.id !== undefined) {
            await db.reports.update(report.id, { synced: true });
            console.log(`Reporte local ID ${report.id} sincronizado exitosamente.`);
          }

        } catch (innerError) {
          console.error(`Fallo al sincronizar reporte ${report.id}:`, innerError);
          // We continue to the next report even if one fails
        }
      }

    } catch (error) {
      console.error("Error general durante la sincronización:", error);
      setSyncError("Error de conexión con el servidor");
    } finally {
      setIsSyncing(false);
      // Re-check pending count immediately after sync attempt
      const remaining = await db.reports.filter(r => r.synced === false || (r as any).synced === 0).count();
      setPendingCount(remaining);
    }
  };

  return { isOnline, pendingCount, isSyncing, syncError, syncReports };
};