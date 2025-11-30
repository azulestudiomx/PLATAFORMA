import { useEffect, useState } from 'react';
import { db } from './db';

// URL of your Backend API
// In development: http://localhost:3000/api/reports
// In production: https://tu-api-real.com/api/reports
// Fix: Cast import.meta to any to avoid TypeScript error "Property 'env' does not exist on type 'ImportMeta'"
const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api/reports';

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

  // Check pending reports count
  useEffect(() => {
    const updateCount = async () => {
      const count = await db.reports.filter(r => r.synced === false || (r as any).synced === 0).count();
      setPendingCount(count);
    };

    updateCount();
    // Poll db every few seconds or use useLiveQuery
    const interval = setInterval(updateCount, 3000);
    return () => clearInterval(interval);
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
            timestamp: report.timestamp,
            user: report.user
          };

          const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
          });

          if (!response.ok) {
            throw new Error(`Server error: ${response.statusText}`);
          }

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
      const remaining = await db.reports.where('synced').equals(0).count();
      setPendingCount(remaining);
    }
  };

  return { isOnline, pendingCount, isSyncing, syncError, syncReports };
};