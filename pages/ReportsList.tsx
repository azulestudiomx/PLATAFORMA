import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { Report } from '../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const ReportsList: React.FC = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    const fetchReports = async () => {
      try {
        // Fetch all reports from Dexie sorted by timestamp descending
        const data = await db.reports.orderBy('timestamp').reverse().toArray();
        setReports(data);
      } catch (error) {
        console.error("Error fetching reports:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
    // Optional: setup a listener if we want real-time updates within the same tab, 
    // but useEffect fetch is sufficient for basic navigation.
  }, []);

  const handleDelete = async (id: number) => {
    if (window.confirm('¿Estás seguro de eliminar este expediente?')) {
      await db.reports.delete(id);
      setReports(reports.filter(r => r.id !== id));
    }
  };

  const filteredReports = reports.filter(r =>
    r.municipio.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.comunidad.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.needType.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleExportPDF = () => {
    const doc = new jsPDF();

    // Title
    doc.setFontSize(18);
    doc.setTextColor(139, 0, 0); // Brand primary color
    doc.text('Reporte de Expedientes Ciudadanos', 14, 22);

    // Metadata
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Fecha de emisión: ${new Date().toLocaleDateString('es-MX')}`, 14, 30);
    if (searchTerm) {
      doc.text(`Filtro aplicado: "${searchTerm}"`, 14, 35);
    }

    // Table
    const tableColumn = ["Folio", "Municipio", "Comunidad", "Necesidad", "Fecha", "Estatus"];
    const tableRows = filteredReports.map(report => [
      report.id || '-',
      report.municipio,
      report.comunidad,
      report.needType,
      new Date(report.timestamp).toLocaleDateString('es-MX'),
      report.synced ? 'Sincronizado' : 'Pendiente'
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 40,
      headStyles: { fillColor: [139, 0, 0] }, // Brand primary
      styles: { fontSize: 9 },
      alternateRowStyles: { fillColor: [245, 245, 245] }
    });

    doc.save('reportes_ciudadanos.pdf');
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h2 className="text-2xl font-bold text-gray-800 border-b-2 border-brand-accent pb-2">
          Expedientes Ciudadanos
        </h2>

        <div className="relative w-full md:w-64">
          <input
            type="text"
            placeholder="Buscar por municipio..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-primary"
          />
          <i className="fas fa-search absolute left-3 top-3 text-gray-400"></i>
        </div>

        <button
          onClick={handleExportPDF}
          className="bg-brand-primary text-white px-4 py-2 rounded-lg hover:bg-red-800 transition-colors flex items-center gap-2 shadow-sm"
        >
          <i className="fas fa-file-pdf"></i>
          Exportar PDF
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">
            <i className="fas fa-spinner fa-spin text-2xl mb-2"></i>
            <p>Cargando expedientes...</p>
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <i className="fas fa-folder-open text-4xl mb-3"></i>
            <p>No se encontraron expedientes registrados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-sm uppercase tracking-wider border-b border-gray-200">
                  <th className="px-6 py-4 font-bold">Folio</th>
                  <th className="px-6 py-4 font-bold">Ubicación</th>
                  <th className="px-6 py-4 font-bold">Necesidad</th>
                  <th className="px-6 py-4 font-bold">Fecha</th>
                  <th className="px-6 py-4 font-bold">Estatus</th>
                  <th className="px-6 py-4 font-bold text-center">Evidencia</th>
                  <th className="px-6 py-4 font-bold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-gray-100">
                {filteredReports.map((report) => (
                  <tr key={report.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">#{report.id}</td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-gray-800">{report.municipio}</div>
                      <div className="text-xs text-gray-500">{report.comunidad}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        <i className="fas fa-map-marker-alt mr-1"></i>
                        {report.location.lat.toFixed(5)}, {report.location.lng.toFixed(5)}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${report.needType === 'Agua Potable' ? 'bg-blue-100 text-blue-700' :
                          report.needType === 'Luz Eléctrica' ? 'bg-yellow-100 text-yellow-700' :
                            report.needType === 'Salud' ? 'bg-red-100 text-red-700' :
                              'bg-gray-100 text-gray-700'
                        }`}>
                        {report.needType}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {new Date(report.timestamp).toLocaleDateString('es-MX')}
                      <br />
                      <span className="text-xs text-gray-400">{new Date(report.timestamp).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
                    </td>
                    <td className="px-6 py-4">
                      {report.synced ? (
                        <span className="flex items-center gap-1 text-green-600 font-bold text-xs">
                          <i className="fas fa-check-circle"></i> Sincronizado
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-orange-500 font-bold text-xs animate-pulse">
                          <i className="fas fa-clock"></i> Pendiente
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {report.evidenceBase64 ? (
                        <button
                          onClick={() => setSelectedImage(report.evidenceBase64)}
                          className="text-brand-primary hover:text-red-800 transition-colors"
                          title="Ver evidencia"
                        >
                          <i className="fas fa-image text-lg"></i>
                        </button>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => report.id && handleDelete(report.id)}
                        className="text-gray-400 hover:text-red-600 transition-colors p-2"
                        title="Eliminar reporte local"
                      >
                        <i className="fas fa-trash-alt"></i>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Image Modal */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedImage(null)}>
          <div className="bg-white p-2 rounded-lg max-w-3xl max-h-[90vh] overflow-auto shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center bg-gray-200 hover:bg-gray-300 rounded-full text-gray-600 transition-colors"
            >
              <i className="fas fa-times"></i>
            </button>
            <img src={selectedImage} alt="Evidencia" className="w-full h-auto rounded" />
            <div className="p-2 text-center">
              <span className="text-sm font-bold text-gray-600">Evidencia Fotográfica</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsList;