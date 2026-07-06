import React, { useState, useEffect } from 'react';
import { Report, ReportHistoryEntry } from '../types';
import { reportsApi, authApi } from '../services/api';
import Swal from 'sweetalert2';
import { loadPdf } from '../services/lazyLibs';

const HISTORY_ICONS: Record<string, { icon: string; cls: string }> = {
    STATUS_CHANGE: { icon: 'fa-arrows-rotate', cls: 'bg-blue-100 text-blue-600' },
    ASSIGNED:      { icon: 'fa-user-check',    cls: 'bg-indigo-100 text-indigo-600' },
    COMMENT:       { icon: 'fa-comment',       cls: 'bg-emerald-100 text-emerald-600' },
};

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
    const [response, setResponse] = useState('');
    const [customData, setCustomData] = useState<Record<string, any>>({});
    const [tempImage, setTempImage] = useState<string | null>(null);
    const [assignedTo, setAssignedTo] = useState('');
    const [history, setHistory] = useState<ReportHistoryEntry[]>([]);
    const [assignableUsers, setAssignableUsers] = useState<{ username: string; name: string }[]>([]);

    useEffect(() => {
        fetchReportDetails();
    }, [reportId]);

    const fetchReportDetails = async () => {
        setLoading(true);
        try {
            const data = await reportsApi.getById(reportId);
            // Normalize: new SQLite backend uses flat lat/lng, old shape uses location object
            const normalized: Report = {
                ...data,
                // Ensure _id compatibility (new API returns 'id')
                _id: data._id || data.id,
                // Rebuild location object from flat lat/lng if needed
                location: data.location ?? { lat: data.lat ?? 0, lng: data.lng ?? 0 },
            };
            setReport(normalized);
            setStatus(data.status || 'Pendiente');
            setDescription(data.description || '');
            setResponse(data.response || '');
            setAssignedTo(data.assignedTo || '');

            // Historial del flujo (no bloquea la carga principal)
            reportsApi.history(reportId).then(setHistory).catch(() => setHistory([]));
            // Lista de usuarios para asignar (solo disponible para admin; si falla, se usa texto libre)
            authApi.listUsers().then(setAssignableUsers).catch(() => setAssignableUsers([]));
            // customData is stored as JSON string in SQLite
            let cd = data.customData;
            if (typeof cd === 'string') { try { cd = JSON.parse(cd); } catch { cd = {}; } }
            setCustomData(cd || {});
        } catch (error: any) {
            console.error(error);
            Swal.fire('Error', error.message || 'Error al cargar los detalles del reporte', 'error');
            onClose();
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await reportsApi.update(reportId, {
                status,
                description,
                assignedTo: assignedTo || null,
                evidenceBase64: tempImage || report?.evidenceBase64,
                customData: JSON.stringify(customData),
                response: status === 'Resuelto' ? response : undefined,
                resolvedAt: status === 'Resuelto' ? new Date().toISOString() : undefined,
            });
            await Swal.fire('¡Actualizado!', 'Reporte actualizado correctamente', 'success');
            onUpdate();
            onClose();
        } catch (error: any) {
            console.error(error);
            Swal.fire('Error', error.message || 'Error al actualizar el reporte', 'error');
        } finally {
            setSaving(false);
        }
    };

    const generatePDF = async () => {
        if (!report) return;

        const { jsPDF } = await loadPdf();
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 20;

        // Header
        doc.setFillColor(139, 0, 0); // #8B0000
        doc.rect(0, 0, pageWidth, 40, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text('Ficha Técnica de Reporte', margin, 25);
        doc.setFontSize(10);
        doc.text('Plataforma Ciudadana Campeche', margin, 35);

        // Info Section
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');

        let y = 60;

        // Folio & Date
        doc.setFont('helvetica', 'bold');
        doc.text(`Folio: ${report._id ? report._id.slice(-6) : 'PENDIENTE'}`, margin, y);
        doc.text(`Fecha: ${new Date(report.timestamp).toLocaleDateString('es-MX')}`, pageWidth - margin - 50, y);
        y += 10;

        // Location
        doc.text(`Municipio: ${report.municipio}`, margin, y);
        doc.text(`Comunidad: ${report.comunidad}`, pageWidth / 2, y);
        y += 10;

        doc.text(`Tipo de Necesidad: ${report.needType}`, margin, y);
        doc.text(`Estatus: ${report.status}`, pageWidth / 2, y);
        y += 15;

        // Description
        doc.setFillColor(245, 245, 245);
        doc.rect(margin, y, pageWidth - (margin * 2), 30, 'F');
        doc.setFont('helvetica', 'bold');
        doc.text('Descripción del Problema:', margin + 5, y + 8);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        const splitDesc = doc.splitTextToSize(report.description, pageWidth - (margin * 2) - 10);
        doc.text(splitDesc, margin + 5, y + 15);
        y += 40;

        // Evidence Image
        if (report.evidenceBase64 || report.evidenceUrl) {
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('Evidencia Fotográfica:', margin, y);
            y += 5;
            try {
                const imgData = report.evidenceBase64 || report.evidenceUrl;
                if (imgData) {
                    doc.addImage(imgData, 'JPEG', margin, y, 100, 75);
                    y += 80;
                }
            } catch (e) {
                console.error('Error adding image to PDF', e);
                doc.text('(Error al cargar la imagen)', margin, y + 10);
                y += 20;
            }
        }

        // Map Link (guard: location might be missing)
        const lat = report.location?.lat;
        const lng = report.location?.lng;
        if (lat && lng) {
            doc.setFontSize(10);
            doc.setTextColor(0, 0, 255);
            doc.textWithLink('Ver ubicación en Google Maps', margin, y, { url: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` });
        }

        // Footer
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(8);
        doc.text(`Generado el: ${new Date().toLocaleString()}`, margin, doc.internal.pageSize.getHeight() - 10);

        doc.save(`Ficha_Reporte_${report.municipio}_${report.needType}.pdf`);
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
                            {/* Status + Asignación */}
                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Estatus del Reporte</label>
                                    {editMode ? (
                                        <select
                                            value={status}
                                            onChange={(e) => setStatus(e.target.value)}
                                            className="w-full p-2 border rounded-md"
                                        >
                                            <option value="Pendiente">Pendiente</option>
                                            <option value="Asignado">Asignado</option>
                                            <option value="En Proceso">En Proceso</option>
                                            <option value="Resuelto">Resuelto</option>
                                        </select>
                                    ) : (
                                        <span className={`px-3 py-1 rounded-full text-sm font-bold ${status === 'Resuelto' ? 'bg-green-100 text-green-800' :
                                            status === 'En Proceso' ? 'bg-yellow-100 text-yellow-800' :
                                            status === 'Asignado' ? 'bg-indigo-100 text-indigo-800' :
                                                'bg-red-100 text-red-800'
                                            }`}>
                                            {status}
                                        </span>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">
                                        <i className="fas fa-user-check text-indigo-500 mr-1.5"></i>
                                        Responsable asignado
                                    </label>
                                    {editMode ? (
                                        assignableUsers.length > 0 ? (
                                            <select
                                                value={assignedTo}
                                                onChange={(e) => setAssignedTo(e.target.value)}
                                                className="w-full p-2 border rounded-md"
                                            >
                                                <option value="">Sin asignar</option>
                                                {assignableUsers.map(u => (
                                                    <option key={u.username} value={u.username}>{u.name} (@{u.username})</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <input
                                                type="text"
                                                value={assignedTo}
                                                onChange={(e) => setAssignedTo(e.target.value)}
                                                placeholder="Usuario responsable"
                                                className="w-full p-2 border rounded-md"
                                            />
                                        )
                                    ) : (
                                        <p className="text-sm text-gray-700">
                                            {assignedTo
                                                ? <><i className="fas fa-user text-gray-400 mr-1.5"></i>{assignableUsers.find(u => u.username === assignedTo)?.name || assignedTo}</>
                                                : <span className="text-gray-400 italic">Sin asignar</span>}
                                        </p>
                                    )}
                                </div>
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

                            {/* Response Section (Only if Resolved or Editing) */}
                            {(status === 'Resuelto' || editMode) && (
                                <div className={`p-4 rounded-lg border ${status === 'Resuelto' ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">
                                        <i className="fas fa-check-circle text-green-600 mr-2"></i>
                                        Respuesta / Solución
                                    </label>
                                    {editMode ? (
                                        <textarea
                                            value={response}
                                            onChange={(e) => setResponse(e.target.value)}
                                            className="w-full p-3 border rounded-md h-24"
                                            placeholder="Describa cómo se solucionó el problema..."
                                        />
                                    ) : (
                                        <div className="text-gray-800">
                                            {response || <span className="text-gray-400 italic">Sin respuesta registrada</span>}
                                            {report.resolvedAt && (
                                                <p className="text-xs text-gray-500 mt-2 text-right">
                                                    Resuelto el: {new Date(report.resolvedAt).toLocaleDateString('es-MX')}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

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

                            {/* Historial del flujo */}
                            {history.length > 0 && (
                                <div className="border-t pt-4">
                                    <h3 className="font-bold text-gray-800 mb-3">
                                        <i className="fas fa-timeline text-gray-400 mr-2"></i>
                                        Historial del expediente
                                    </h3>
                                    <div className="space-y-3">
                                        {history.map(h => {
                                            const s = HISTORY_ICONS[h.action] || { icon: 'fa-circle-info', cls: 'bg-gray-100 text-gray-500' };
                                            return (
                                                <div key={h.id} className="flex gap-3 items-start">
                                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${s.cls}`}>
                                                        <i className={`fas ${s.icon} text-[10px]`}></i>
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-sm text-gray-700">
                                                            {h.action === 'STATUS_CHANGE' && (
                                                                <>Cambio de estatus: <b>{h.fromStatus || '—'}</b> → <b>{h.toStatus}</b></>
                                                            )}
                                                            {h.action === 'ASSIGNED' && <>{h.note || 'Asignación actualizada'}</>}
                                                            {h.action === 'COMMENT' && <>{h.note}</>}
                                                        </p>
                                                        <p className="text-[11px] text-gray-400">
                                                            {h.username ? `@${h.username} · ` : ''}
                                                            {new Date(h.createdAt).toLocaleString('es-MX')}
                                                        </p>
                                                        {h.action === 'STATUS_CHANGE' && h.note && (
                                                            <p className="text-xs text-gray-500 mt-0.5 italic">"{h.note}"</p>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

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
                            {/* Evidence Photo Gallery */}
                            <div>
                                <h3 className="font-bold text-gray-800 mb-2">Evidencia Fotográfica Gallery</h3>
                                <div className="space-y-3">
                                    {/* Main Display Grid */}
                                    <div className="grid grid-cols-2 gap-2">
                                        {(tempImage || report.evidenceBase64 || (report.evidenceGallery && report.evidenceGallery.length > 0)) ? (
                                            (tempImage ? [tempImage] : report.evidenceGallery && report.evidenceGallery.length > 0 ? report.evidenceGallery : [report.evidenceBase64!]).map((img, idx) => (
                                                <div key={idx} className="relative group">
                                                    <img
                                                        src={img}
                                                        alt={`Evidencia ${idx + 1}`}
                                                        className="w-full h-32 object-cover rounded-xl shadow-sm border border-gray-100 cursor-pointer hover:brightness-90 transition-all"
                                                        onClick={() => {
                                                            const w = window.open("");
                                                            w?.document.write(`<img src="${img}" style="width:100%"/>`);
                                                        }}
                                                    />
                                                    {editMode && (
                                                        <button 
                                                            onClick={() => {
                                                                if (tempImage) { setTempImage(null); }
                                                                else {
                                                                    const newGallery = (report.evidenceGallery || []).filter((_, i) => i !== idx);
                                                                    setReport({ ...report, evidenceGallery: newGallery });
                                                                }
                                                            }}
                                                            className="absolute top-1 right-1 w-6 h-6 rounded-lg bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                        >
                                                            <i className="fas fa-times text-[10px]"></i>
                                                        </button>
                                                    )}
                                                </div>
                                            ))
                                        ) : (
                                            <div className="col-span-2 w-full h-32 bg-gray-100 rounded-xl flex items-center justify-center text-gray-400 border-2 border-dashed border-gray-200">
                                                <div className="text-center">
                                                    <i className="fas fa-image text-2xl mb-1"></i>
                                                    <p className="text-[10px] font-bold uppercase tracking-wider">Sin evidencias</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {editMode && (
                                        <div className="flex gap-2">
                                            <label className="flex-1">
                                                <div className="btn-ghost text-[10px] cursor-pointer flex items-center justify-center gap-2 border-brand-primary/20 bg-red-50/50 text-brand-primary h-10 rounded-xl font-bold uppercase tracking-widest">
                                                    <i className="fas fa-camera"></i> Añadir Evidencia
                                                </div>
                                                <input 
                                                    type="file" 
                                                    accept="image/*" 
                                                    capture="environment"
                                                    className="hidden" 
                                                    onChange={(e) => {
                                                        const file = e.target.files?.[0];
                                                        if (file) {
                                                            const reader = new FileReader();
                                                            reader.onloadend = () => {
                                                                const base64 = reader.result as string;
                                                                if (report.evidenceGallery) {
                                                                    setReport({ ...report, evidenceGallery: [...report.evidenceGallery, base64].slice(0, 4) });
                                                                } else {
                                                                    setReport({ ...report, evidenceGallery: [report.evidenceBase64 || base64].slice(0, 4) });
                                                                }
                                                            };
                                                            reader.readAsDataURL(file);
                                                        }
                                                    }}
                                                />
                                            </label>
                                        </div>
                                    )}
                                </div>
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
                    <button
                        onClick={generatePDF}
                        className="px-6 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition flex items-center gap-2"
                    >
                        <i className="fas fa-file-pdf"></i> Exportar Ficha
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ReportDetailsModal;
