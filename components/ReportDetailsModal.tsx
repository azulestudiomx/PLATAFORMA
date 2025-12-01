import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../src/config';
import { Report } from '../types';
import Swal from 'sweetalert2';

interface ReportDetailsModalProps {
    reportId: string;
    onClose: () => void;
    onUpdate: () => void;
}

const ReportDetailsModal: React.FC<ReportDetailsModalProps> = ({ reportId, onClose, onUpdate }) => {
    const [report, setReport] = useState<Report | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editMode, setEditMode] = useState(false);

    // Form State
    const [status, setStatus] = useState('');
    const [description, setDescription] = useState('');
    const [customData, setCustomData] = useState<Record<string, any>>({});

    useEffect(() => {
        fetchReportDetails();
    }, [reportId]);

    const fetchReportDetails = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/reports/${reportId}`);
            if (!res.ok) throw new Error('Error al cargar reporte');
            const data = await res.json();
            setReport(data);

            // Initialize form
            setStatus(data.status);
            setDescription(data.description);
            setCustomData(data.customData || {});
        } catch (error) {
            console.error(error);
            Swal.fire('Error', 'Error al cargar los detalles del reporte', 'error');
            onClose();
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/reports/${reportId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status,
                    description,
                    customData
                })
            });

            if (!res.ok) throw new Error('Error al guardar');

            await Swal.fire('¡Actualizado!', 'Reporte actualizado correctamente', 'success');
            onUpdate();
            onClose();
        } catch (error) {
            console.error(error);
            Swal.fire('Error', 'Error al actualizar el reporte', 'error');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white p-6 rounded-lg shadow-xl">
                    <i className="fas fa-spinner fa-spin text-brand-primary text-3xl"></i>
                </div>
            </div>
        );
    }

    if (!report) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">

                {/* Header */}
                <div className="bg-brand-primary text-white p-4 flex justify-between items-center shrink-0">
                    <h2 className="text-xl font-bold">Expediente: {report.municipio} - {report.needType}</h2>
                    <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-full transition">
                        <i className="fas fa-times text-xl"></i>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                        {/* Left Column: Info & Form */}
                        <div className="space-y-6">
                            {/* Status Section */}
                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                <label className="block text-sm font-bold text-gray-700 mb-2">Estatus del Reporte</label>
                                {editMode ? (
                                    <select
                                        value={status}
                                        onChange={(e) => setStatus(e.target.value)}
                                        className="w-full p-2 border rounded-md"
                                    >
                                        <option value="Pendiente">Pendiente</option>
                                        <option value="En Proceso">En Proceso</option>
                                        <option value="Resuelto">Resuelto</option>
                                    </select>
                                ) : (
                                    <span className={`px-3 py-1 rounded-full text-sm font-bold ${status === 'Resuelto' ? 'bg-green-100 text-green-800' :
                                        status === 'En Proceso' ? 'bg-yellow-100 text-yellow-800' :
                                            'bg-red-100 text-red-800'
                                        }`}>
                                        {status}
                                    </span>
                                )}
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Descripción</label>
                                {editMode ? (
                                    <textarea
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        className="w-full p-3 border rounded-md h-32"
                                    />
                                ) : (
                                    <p className="text-gray-600 bg-white p-3 border rounded-md min-h-[5rem]">
                                        {description}
                                    </p>
                                )}
                            </div>

                            {/* Metadata */}
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="block font-bold text-gray-500">Fecha</span>
                                    <p>{new Date(report.timestamp).toLocaleString('es-MX')}</p>
                                </div>
                                <div>
                                    <span className="block font-bold text-gray-500">Comunidad</span>
                                    <p>{report.comunidad}</p>
                                </div>
                                <div>
                                    <span className="block font-bold text-gray-500">Usuario</span>
                                    <p>{report.user || 'Desconocido'}</p>
                                </div>
                            </div>

                            {/* Dynamic Fields */}
                            {Object.keys(customData).length > 0 && (
                                <div className="border-t pt-4">
                                    <h3 className="font-bold text-gray-800 mb-2">Datos Adicionales</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        {Object.entries(customData).map(([key, value]) => (
                                            <div key={key}>
                                                <span className="block text-xs font-bold text-gray-500 uppercase">{key}</span>
                                                {editMode ? (
                                                    <input
                                                        type="text"
                                                        value={value}
                                                        onChange={(e) => setCustomData({ ...customData, [key]: e.target.value })}
                                                        className="w-full p-1 border rounded text-sm"
                                                    />
                                                ) : (
                                                    <p className="text-sm">{value}</p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Right Column: Evidence & Map */}
                        <div className="space-y-6">
                            {/* Evidence Photo */}
                            <div>
                                <h3 className="font-bold text-gray-800 mb-2">Evidencia Fotográfica</h3>
                                {report.evidenceBase64 ? (
                                    <img
                                        src={report.evidenceBase64}
                                        alt="Evidencia"
                                        className="w-full h-48 object-cover rounded-lg shadow-md hover:scale-105 transition-transform cursor-pointer"
                                        onClick={() => {
                                            const w = window.open("");
                                            w?.document.write(`<img src="${report.evidenceBase64}" style="width:100%"/>`);
                                        }}
                                    />
                                ) : (
                                    <div className="w-full h-48 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">
                                        <div className="text-center">
                                            <i className="fas fa-image text-3xl mb-2"></i>
                                            <p>Sin evidencia</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Map Placeholder (Could be enhanced with actual Map component) */}
                            <div>
                                <h3 className="font-bold text-gray-800 mb-2">Ubicación</h3>
                                <div className="bg-gray-100 p-4 rounded-lg text-sm space-y-2">
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Latitud:</span>
                                        <span className="font-mono">{report.location.lat.toFixed(6)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Longitud:</span>
                                        <span className="font-mono">{report.location.lng.toFixed(6)}</span>
                                    </div>
                                    <a
                                        href={`https://www.google.com/maps/search/?api=1&query=${report.location.lat},${report.location.lng}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="block w-full text-center bg-blue-50 text-blue-600 py-2 rounded mt-2 hover:bg-blue-100 transition"
                                    >
                                        <i className="fas fa-map-marker-alt mr-2"></i> Ver en Google Maps
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="bg-gray-50 p-4 border-t flex justify-end gap-3 shrink-0">
                    {editMode ? (
                        <>
                            <button
                                onClick={() => setEditMode(false)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition"
                                disabled={saving}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSave}
                                className="px-6 py-2 bg-brand-primary text-white rounded-lg hover:bg-red-800 transition flex items-center gap-2"
                                disabled={saving}
                            >
                                {saving ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-save"></i>}
                                Guardar Cambios
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={() => setEditMode(true)}
                            className="px-6 py-2 bg-brand-accent text-brand-primary font-bold rounded-lg hover:bg-yellow-400 transition flex items-center gap-2"
                        >
                            <i className="fas fa-edit"></i> Editar Expediente
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ReportDetailsModal;
