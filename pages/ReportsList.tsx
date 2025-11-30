import React, { useState, useEffect } from 'react';
import { Report } from '../types';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export const ReportsList: React.FC = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Pagination State
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalReports, setTotalReports] = useState(0);

  useEffect(() => {
    fetchReports();
  }, [page]); // Reload when page changes

  const fetchReports = async () => {
    setLoading(true);
    try {
      // Fetch with pagination
      const response = await fetch(`http://localhost:3000/api/reports?page=${page}&limit=20`);
      const data = await response.json();

      // Handle paginated response
      if (data.data) {
        setReports(data.data);
        setTotalPages(data.pages);
        setTotalReports(data.total);
      } else {
        // Fallback for non-paginated response (just in case)
        setReports(data);
      }
    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('¿Estás seguro de eliminar este reporte?')) {
      try {
        await fetch(`http://localhost:3000/api/reports/${id}`, {
          method: 'DELETE',
        });
        setReports(reports.filter(r => r._id !== id));
      } catch (error) {
        console.error('Error deleting report:', error);
        alert('Error al eliminar el reporte');
      }
    }
  };

  const exportToPDF = () => {
    const doc = new jsPDF();

    doc.setFontSize(20);
    doc.text('Reporte de Expedientes', 14, 22);
    doc.setFontSize(10);
    doc.text(`Generado el: ${new Date().toLocaleDateString()}`, 14, 30);

    const tableData = reports.map(report => [
      report._id ? report._id.slice(-6) : report.id,
      report.municipio,
      report.comunidad,
      report.needType,
      report.status,
      new Date(report.timestamp).toLocaleDateString()
    ]);

    autoTable(doc, {
      head: [['Folio', 'Municipio', 'Comunidad', 'Necesidad', 'Estatus', 'Fecha']],
      body: tableData,
      startY: 40,
    });

    doc.save('reportes.pdf');
  };

  const filteredReports = reports.filter(r =>
    (r.municipio?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (r.comunidad?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (r.needType?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Expedientes</h2>
          <p className="text-gray-500">
            Total: {totalReports} reportes | Página {page} de {totalPages}
          </p>
        </div>
        <div className="flex gap-4">
          <button
            onClick={exportToPDF}
            className="flex items-center gap-2 px-4 py-2 bg-red-700 text-white rounded-lg hover:bg-red-800 transition-colors"
          >
            <i className="fas fa-file-pdf"></i>
            Exportar PDF
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="relative">
          <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
          <input
            type="text"
            placeholder="Buscar por municipio, comunidad o tipo de necesidad..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-transparent"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Folio</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ubicación</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Necesidad</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estatus</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Evidencia</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    <i className="fas fa-circle-notch fa-spin text-3xl mb-2"></i>
                    <p>Cargando expedientes...</p>
                  </td>
                </tr>
              ) : filteredReports.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    No se encontraron expedientes
                  </td>
                </tr>
              ) : (
                filteredReports.map((report) => (
                  <tr key={report._id || report.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900" title={report._id}>
                      #{report._id ? report._id.slice(-6) : report.id}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{report.municipio}</div>
                      <div className="text-sm text-gray-500">{report.comunidad}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {report.needType}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(report.timestamp).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${report.status === 'Resuelto' ? 'bg-green-100 text-green-800' :
                        report.status === 'En Proceso' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                        {report.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {(report.hasEvidence || report.evidenceBase64) ? (
                        <button
                          onClick={async () => {
                            if (report.evidenceBase64) {
                              setSelectedImage(report.evidenceBase64);
                            } else {
                              try {
                                const res = await fetch(`http://localhost:3000/api/reports/${report._id}`);
                                const data = await res.json();
                                if (data.evidenceBase64) {
                                  setSelectedImage(data.evidenceBase64);
                                } else {
                                  alert('No se pudo cargar la imagen');
                                }
                              } catch (error) {
                                console.error('Error loading image:', error);
                                alert('Error al cargar la imagen');
                              }
                            }
                          }}
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
                        onClick={() => handleDelete(report._id || report.id!)}
                        className="text-gray-400 hover:text-red-600 transition-colors"
                        title="Eliminar"
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${page === 1 || loading
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 shadow-sm'
              }`}
          >
            <i className="fas fa-chevron-left mr-2"></i>
            Anterior
          </button>

          <span className="text-sm text-gray-600">
            Página <span className="font-medium text-gray-900">{page}</span> de <span className="font-medium text-gray-900">{totalPages}</span>
          </span>

          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || loading}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${page === totalPages || loading
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 shadow-sm'
              }`}
          >
            Siguiente
            <i className="fas fa-chevron-right ml-2"></i>
          </button>
        </div>
      </div>

      {/* Image Modal */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedImage(null)}>
          <div className="relative max-w-4xl w-full bg-white rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
            <div className="absolute top-4 right-4 z-10">
              <button
                onClick={() => setSelectedImage(null)}
                className="bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors"
              >
                <i className="fas fa-times text-xl"></i>
              </button>
            </div>
            <img
              src={selectedImage}
              alt="Evidencia"
              className="w-full h-auto max-h-[80vh] object-contain bg-gray-100"
            />
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