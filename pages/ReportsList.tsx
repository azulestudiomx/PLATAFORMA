import React, { useState, useEffect } from 'react';
import { Report } from '../types';
import { reportsApi } from '../services/api';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import ReportDetailsModal from '../components/ReportDetailsModal';
import Swal from 'sweetalert2';
import { db } from '../services/db';
import { useSyncReports } from '../services/syncHook';
import * as XLSX from 'xlsx';

export const ReportsList: React.FC = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  // Pagination State
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalReports, setTotalReports] = useState(0);

  // Sync Hook
  const { isOnline, pendingCount, isSyncing, syncReports } = useSyncReports();

  useEffect(() => {
    fetchReports();
  }, [page, isOnline]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const allLocal = await db.reports.toArray();
      const localUnsynced = allLocal.filter(r => r.synced === 0 || r.synced === false);

      let serverReports: Report[] = [];
      let serverTotal = 0;
      let serverPages = 1;

      if (isOnline) {
        try {
          const data = await reportsApi.list(page, 20);
          if (data.data) {
            serverReports = data.data;
            serverPages = data.pages;
            serverTotal = data.total;
          } else {
            serverReports = Array.isArray(data) ? data : [];
          }
        } catch (err) {
          console.warn('Error fetching server reports:', err);
        }
      }

      const mergedReports = [...localUnsynced, ...serverReports];
      setReports(mergedReports);
      setTotalPages(serverPages);
      setTotalReports(serverTotal + localUnsynced.length);
    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string | number) => {
    const result = await Swal.fire({
      title: '¿Confirmar eliminación?',
      text: "Esta acción no se puede deshacer.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#8B0000',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      backdrop: `rgba(0,0,0,0.4)`
    });

    if (result.isConfirmed) {
      try {
        if (typeof id === 'number') { await db.reports.delete(id); } 
        else { await reportsApi.delete(String(id)); }
        setReports(reports.filter(r => (r.id || r._id) !== id));
        Swal.fire('¡Eliminado!', 'El registro ha sido removido.', 'success');
      } catch (error: any) {
        Swal.fire('Error', error.message || 'Error al eliminar', 'error');
      }
    }
  };

  const exportToPDF = async () => {
    try {
      Swal.fire({
        title: 'Generando PDF...',
        text: 'Preparando reporte consolidado',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
      });

      let exportData: Report[] = [];
      if (isOnline) {
        const data = await reportsApi.list(1, 1000);
        exportData = data.data || [];
      } else {
        exportData = await db.reports.toArray();
      }

      if (exportData.length === 0) {
        Swal.fire('Atención', 'No hay datos para exportar.', 'info');
        return;
      }

      const doc = new jsPDF();
      doc.setFont('helvetica', 'bold');
      doc.text('PLATAFORMA CIUDADANA CAMPECHE', 14, 15);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Listado General de Expedientes - Generado el ${new Date().toLocaleDateString()}`, 14, 22);

      const tableData = exportData.map(r => [
        (typeof r.id === 'string' ? r.id : (r.id ? `LOC-${r.id}` : r._id || 'S/N')).toString().slice(0, 10),
        r.municipio || '-',
        r.comunidad || '-',
        r.needType || '-',
        r.status || 'Pendiente',
        r.timestamp ? format(new Date(r.timestamp), 'dd/MM/yyyy') : '-'
      ]);

      autoTable(doc, {
        head: [['Folio', 'Municipio', 'Comunidad', 'Necesidad', 'Estatus', 'Fecha']],
        body: tableData,
        startY: 30,
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [139, 0, 0] },
        alternateRowStyles: { fillColor: [245, 245, 245] }
      });

      doc.save(`EXPEDIENTES_CAMPECHE_${Date.now()}.pdf`);
      Swal.fire({ title: '¡PDF Generado!', icon: 'success', timer: 1500, showConfirmButton: false });
    } catch (error) {
      console.error('PDF Export Error:', error);
      Swal.fire('Error', 'No se pudo generar el reporte PDF. Intente de nuevo.', 'error');
    }
  };

  const exportToExcel = async () => {
    try {
      Swal.fire({
        title: 'Generando Excel...',
        text: 'Preparando base de datos completa',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
      });

      // Fetch ALL server records or use combined local if offline
      let allExportData: Report[] = [];
      if (isOnline) {
        const data = await reportsApi.list(1, 1000); // Massive fetch for export
        allExportData = data.data || [];
      } else {
        allExportData = await db.reports.toArray();
      }

      const worksheet = XLSX.utils.json_to_sheet(allExportData.map(r => ({
        Folio: r.id || r._id,
        Municipio: r.municipio,
        Comunidad: r.comunidad,
        'Tipo de Necesidad': r.needType,
        Estatus: r.status,
        Ubicación: `${r.location?.lat}, ${r.location?.lng}`,
        Fecha: format(new Date(r.timestamp), 'PPpp', { locale: es }),
        Origen: r.user || 'Desconocido',
        Urgencia: r.urgency || 'Normal',
        Sentimiento: r.sentiment || 'Neutral',
        Respuesta: r.response || 'Pendiente'
      })));

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Expedientes");
      
      // Auto-size columns approximate
      const wscols = [{ wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 25 }, { wch: 25 }, { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 30 }];
      worksheet['!cols'] = wscols;

      XLSX.writeFile(workbook, `BASE_DATOS_CAMPECHE_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
      Swal.fire('¡Éxito!', 'Archivo generado correctamente.', 'success');
    } catch (error) {
      console.error('Excel Export Error:', error);
      Swal.fire('Error', 'No se pudo generar el archivo Excel.', 'error');
    }
  };

  const generateReportPDF = async (report: Report) => {
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const primaryColor = [139, 0, 0]; // Campeche Red
      
      // Header / Brand
      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(0, 0, 210, 40, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22); doc.setFont('helvetica', 'bold');
      doc.text('FICHA DE CAMPO', 20, 20);
      doc.setFontSize(10); doc.setFont('helvetica', 'normal');
      doc.text('PLATAFORMA CIUDADANA CAMPECHE · GESTIÓN ESTRATÉGICA', 20, 28);
      
      // Folio Badge
      const folio = (typeof report.id === 'string' ? report.id : report.id?.toString())?.slice(0, 8) || 'PENDIENTE';
      doc.setFillColor(255, 255, 255, 0.2);
      doc.roundedRect(150, 12, 45, 18, 3, 3, 'F');
      doc.setFontSize(8); doc.text('FOLIO REGISTRO:', 155, 18);
      doc.setFontSize(14); doc.setFont('helvetica', 'bold');
      doc.text(folio, 155, 26);

      // Left Column: Details
      doc.setTextColor(50, 50, 50);
      doc.setFontSize(12); doc.setFont('helvetica', 'bold');
      doc.text('DETALLES DEL CIUDADANO', 20, 55);
      doc.setDrawColor(230, 230, 230); doc.line(20, 58, 100, 58);

      const details = [
        ['MUNICIPIO:', (report.municipio || '').toUpperCase()],
        ['COMUNIDAD:', (report.comunidad || '').toUpperCase()],
        ['NECESIDAD:', (report.needType || '').toUpperCase()],
        ['ESTATUS:', (report.status || '').toUpperCase()],
        ['FECHA:', format(new Date(report.timestamp), 'PPP', { locale: es })],
      ];

      let y = 68;
      details.forEach(([label, value]) => {
        doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(150);
        doc.text(label, 20, y);
        doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(30);
        doc.text(value, 20, y + 5);
        y += 15;
      });

      // Description Box
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(20, y, 80, 40, 2, 2, 'F');
      doc.setFontSize(8); doc.setTextColor(150); doc.text('DESCRIPCIÓN DE LA SOLICITUD:', 25, y + 8);
      doc.setFontSize(9); doc.setTextColor(50);
      const splitText = doc.splitTextToSize(report.description || 'Sin descripción detallada.', 70);
      doc.text(splitText, 25, y + 15);

      // Right Column: QR & Location
      if (report.location?.lat) {
        const qrData = `https://www.google.com/maps?q=${report.location?.lat},${report.location?.lng}`;
        const qrUrl = await QRCode.toDataURL(qrData);
        doc.addImage(qrUrl, 'PNG', 130, 50, 40, 40);
        doc.setFontSize(7); doc.setTextColor(180); doc.text('ESCANEAR PARA UBICACIÓN GPS', 150, 95, { align: 'center' });
      }

      // Large Evidence Photo(s)
      const gallery = report.evidenceGallery && report.evidenceGallery.length > 0 
        ? report.evidenceGallery 
        : (report.evidenceBase64 || report.evidenceUrl ? [report.evidenceBase64 || report.evidenceUrl] : []);

      if (gallery.length > 0) {
        doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(50);
        doc.text('EVIDENCIA FOTOGRÁFICA', 120, 110);
        doc.setDrawColor(230, 230, 230); doc.line(120, 113, 190, 113);
        
        let startX = 120;
        let startY = 120;
        const size = gallery.length > 1 ? 33 : 70;
        const gap = 4;

        for (let i = 0; i < Math.min(gallery.length, 4); i++) {
          try {
            const img = gallery[i];
            if (img) {
              const xIdx = i % 2;
              const yIdx = Math.floor(i / 2);
              const xPos = gallery.length > 1 ? startX + (xIdx * (size + gap)) : startX;
              const yPos = gallery.length > 1 ? startY + (yIdx * (size + gap)) : startY;
              
              doc.addImage(img, 'JPEG', xPos, yPos, size, size);
            }
          } catch (e) {
            console.warn(`Error adding image ${i} to PDF`, e);
          }
        }
      }

      // Footer
      doc.setTextColor(200); doc.setFontSize(7);
      doc.text('Documento generado automáticamente por Plataforma Ciudadana Campeche', 105, 285, { align: 'center' });

      doc.save(`Ficha_${report.municipio}_${folio}.pdf`);
      Swal.fire({ title: 'PDF Generado', icon: 'success', timer: 1000, showConfirmButton: false });
    } catch (error) {
      console.error(error);
      Swal.fire('Error', 'No se pudo generar la ficha técnica.', 'error');
    }
  };

  const filteredReports = reports.filter(r =>
    (r.municipio?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (r.comunidad?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (r.needType?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 sm:pb-0">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="font-brand font-bold text-2xl text-gray-900 tracking-tight">Expedientes</h2>
          <p className="text-sm text-gray-400 mt-0.5">Gestión y seguimiento de solicitudes levantadas</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {pendingCount > 0 && isOnline && (
            <button
              onClick={syncReports}
              disabled={isSyncing}
              className="btn-primary bg-amber-600 hover:bg-amber-700 shadow-glow-amber py-2 text-xs flex-1 sm:flex-none"
            >
              <i className={`fas ${isSyncing ? 'fa-spinner fa-spin' : 'fa-sync'} mr-2`}></i>
              Sincronizar {pendingCount}
            </button>
          )}
          <button
            onClick={exportToPDF}
            className="btn-ghost py-2 text-xs flex-1 sm:flex-none border border-gray-200"
          >
            <i className="fas fa-file-pdf mr-2"></i>
            Exportar PDF
          </button>
          <button
            onClick={exportToExcel}
            className="h-9 px-4 rounded-xl bg-green-50 text-green-700 border border-green-100 font-bold text-[10px] hover:bg-green-100 transition-all flex items-center justify-center gap-2"
          >
            <i className="fas fa-file-excel"></i>
            EXPORTAR EXCEL
          </button>
        </div>
      </div>

      {/* Filters & Summary Card */}
      <div className="bg-white rounded-2xl shadow-card p-4 sm:p-5 border border-gray-50 flex flex-col sm:flex-row items-center gap-4">
        <div className="relative flex-1 w-full">
          <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs text-brand-primary"></i>
          <input
            type="text"
            placeholder="Buscar por municipio, comunidad o necesidad..."
            className="input-modern pl-10 h-11 text-sm w-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-6 px-4 shrink-0 w-full sm:w-auto border-t sm:border-t-0 sm:border-l border-gray-100 pt-4 sm:pt-0 whitespace-nowrap overflow-hidden">
          <div className="text-center sm:text-left">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">Total</p>
            <p className="text-lg font-brand font-bold text-slate-800 leading-none">{totalReports}</p>
          </div>
          <div className="text-center sm:text-left">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">Página</p>
            <p className="text-lg font-brand font-bold text-slate-800 leading-none">{page}<span className="text-xs text-gray-400 ml-1 font-normal">/ {totalPages}</span></p>
          </div>
        </div>
      </div>

      {/* Table Container / Mobile Cards */}
      <div className="bg-white rounded-3xl shadow-card border border-gray-50 overflow-hidden transition-all">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 hidden lg:table">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Folio</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Ubicación</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Necesidad</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Estatus</th>
                <th className="px-6 py-4 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">Evidencia</th>
                <th className="px-6 py-4 text-right text-[10px] font-bold text-gray-400 uppercase tracking-widest">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                        <i className="fas fa-circle-notch fa-spin text-2xl text-brand-primary"></i>
                        <span className="text-xs font-semibold text-gray-400">Cargando expedientes...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredReports.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center text-gray-400 italic text-sm">
                    No se encontraron expedientes registrados.
                  </td>
                </tr>
              ) : (
                filteredReports.map((report) => {
                const serverId = typeof report.id === 'string' ? report.id : null;
                const isLocal = !serverId || report.synced === 0 || report.synced === false;
                const displayId = serverId ? serverId.slice(0, 8) : `LOC-${report.id}`;
                return (
                  <tr key={report.id} className={`hover:bg-red-50/30 transition-colors group ${isLocal ? 'bg-orange-50/40' : ''}`}>
                    <td className="px-6 py-4">
                      {isLocal ? (
                        <span className="flex items-center gap-1.5 text-orange-600 font-bold text-xs" title="Pendiente de sincronizar">
                          <i className="fas fa-cloud-upload-alt opacity-70"></i>{displayId}
                        </span>
                      ) : (
                        <span className="text-brand-primary font-mono text-xs font-bold leading-none">{displayId}</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-bold text-gray-800">{report.municipio}</div>
                      <div className="text-[10px] font-semibold text-gray-400 uppercase leading-none mt-1">{report.comunidad}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="badge badge-gray bg-white border-gray-100 text-[10px]">
                        {report.needType}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {isLocal ? (
                        <span className="badge badge-orange text-[9px]">
                          <i className="fas fa-clock mr-1"></i> Local
                        </span>
                      ) : (
                        <span className={`badge text-[9px] ${
                            report.status === 'Resuelto' ? 'badge-green' : 
                            report.status === 'En Proceso' ? 'badge-yellow' : 'badge-red'
                        }`}>
                          {report.status}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {(report.hasEvidence || report.evidenceBase64 || report.evidenceUrl) ? (
                        <button
                          onClick={() => setSelectedImage(report.evidenceUrl || report.evidenceBase64 || null)}
                          className="w-8 h-8 rounded-lg bg-red-50 text-brand-primary flex items-center justify-center hover:bg-brand-primary hover:text-white transition-all mx-auto"
                        >
                          <i className="fas fa-image text-xs"></i>
                        </button>
                      ) : (
                        <span className="text-gray-200">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                       <div className="flex justify-end gap-1">
                            <button
                                onClick={() => generateReportPDF(report)}
                                className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                                title="Descargar Ficha PDF"
                            >
                                <i className="fas fa-file-pdf text-xs"></i>
                            </button>
                            {serverId && (
                                <button
                                onClick={() => setSelectedReportId(serverId)}
                                className="w-8 h-8 rounded-lg bg-gray-50 text-gray-600 flex items-center justify-center hover:bg-brand-primary hover:text-white transition-all"
                                title="Ver detalles y editar"
                                >
                                <i className="fas fa-chevron-right text-xs"></i>
                                </button>
                            )}
                            <button
                                onClick={() => handleDelete(typeof report.id === 'number' ? report.id : String(report.id))}
                                className="w-8 h-8 rounded-lg bg-gray-50 text-gray-400 flex items-center justify-center hover:bg-red-600 hover:text-white transition-all"
                            >
                                <i className="fas fa-trash-alt text-xs"></i>
                            </button>
                       </div>
                    </td>
                  </tr>
                );
              })
              )}
            </tbody>
          </table>

          {/* Mobile/Tablet Card View */}
          <div className="lg:hidden grid grid-cols-1 divide-y divide-gray-50">
                {loading ? (
                    <div className="p-10 text-center text-gray-400">Cargando...</div>
                ) : filteredReports.map((report) => (
                    <div key={report.id} className={`p-4 ${!report.synced ? 'bg-orange-50/30' : ''}`}>
                         <div className="flex justify-between items-start mb-3">
                            <div>
                                <p className="text-[10px] font-bold text-brand-primary font-mono mb-1">
                                    {typeof report.id === 'string' ? report.id.slice(0, 8) : `LOC-${report.id}`}
                                </p>
                                <h4 className="font-bold text-gray-800 leading-tight">{report.municipio}</h4>
                                <p className="text-[10px] text-gray-400 uppercase font-semibold">{report.comunidad}</p>
                            </div>
                            <span className={`badge text-[9px] ${
                                report.status === 'Resuelto' ? 'badge-green' : 
                                report.status === 'En Proceso' ? 'badge-yellow' : 'badge-red'
                            }`}>
                                {report.status}
                            </span>
                         </div>
                         <div className="flex items-center justify-between">
                             <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
                                <i className="fas fa-calendar-alt text-[10px]"></i>
                                {new Date(report.timestamp).toLocaleDateString()}
                             </div>
                             <div className="flex gap-2">
                                <button
                                    onClick={() => setSelectedReportId(typeof report.id === 'string' ? report.id : null)}
                                    className="px-3 py-1.5 rounded-lg bg-brand-primary text-white text-[10px] font-bold"
                                >
                                    Ver Detalle
                                </button>
                                <button className="w-8 h-8 rounded-lg bg-gray-100 text-gray-400 flex items-center justify-center">
                                    <i className="fas fa-trash-alt text-[10px]"></i>
                                </button>
                             </div>
                         </div>
                    </div>
                ))}
          </div>
        </div>

        {/* Action Bar for Mobile/Tablet Pagination */}
        <div className="p-4 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between gap-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="btn-ghost py-2 px-6 text-xs h-10 border border-gray-100 bg-white"
          >
            Anterior
          </button>
          <div className="flex gap-1">
            {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => (
                <button 
                    key={i} 
                    onClick={() => setPage(i + 1)}
                    className={`w-10 h-10 rounded-xl text-xs font-bold transition-all ${page === i + 1 ? 'bg-brand-primary text-white shadow-glow-red' : 'bg-white text-gray-400 hover:bg-gray-100'}`}
                >
                    {i + 1}
                </button>
            ))}
          </div>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="btn-ghost py-2 px-6 text-xs h-10 border border-gray-100 bg-white"
          >
            Siguiente
          </button>
        </div>
      </div>

      {/* Modals same as before but premium */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md" onClick={() => setSelectedImage(null)}>
          <div className="relative max-w-4xl w-full bg-white rounded-3xl shadow-2xl overflow-hidden animate-fade-in" onClick={e => e.stopPropagation()}>
            <img src={selectedImage} alt="Evidencia" className="w-full h-auto max-h-[85vh] object-contain" />
            <button
                onClick={() => setSelectedImage(null)}
                className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/20 backdrop-blur-md text-white flex items-center justify-center hover:bg-red-600 transition-all"
            >
                <i className="fas fa-times"></i>
            </button>
          </div>
        </div>
      )}

      {selectedReportId && (
        <ReportDetailsModal
          reportId={selectedReportId}
          onClose={() => setSelectedReportId(null)}
          onUpdate={() => fetchReports()}
        />
      )}
    </div>
  );
};

export default ReportsList;