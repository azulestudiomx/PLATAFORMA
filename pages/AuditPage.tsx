import React, { useState, useEffect, useCallback } from 'react';
import { statsApi } from '../services/api';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface AuditEntry {
    id: string;
    username: string | null;
    role: string | null;
    action: string;
    entity: string;
    entityId: string | null;
    detail: string | null;
    createdAt: string;
}

const ACTION_STYLES: Record<string, { label: string; cls: string; icon: string }> = {
    CREATE: { label: 'Creación',   cls: 'bg-emerald-50 text-emerald-700', icon: 'fa-plus' },
    UPDATE: { label: 'Edición',    cls: 'bg-blue-50 text-blue-700',       icon: 'fa-pen' },
    DELETE: { label: 'Eliminación',cls: 'bg-red-50 text-red-700',         icon: 'fa-trash' },
    LOGIN:  { label: 'Inicio de sesión', cls: 'bg-slate-100 text-slate-600', icon: 'fa-right-to-bracket' },
};

const ENTITY_LABELS: Record<string, string> = {
    Person: 'Padrón',
    Report: 'Reporte',
    Event: 'Evento',
    User: 'Usuario',
    SystemConfig: 'Configuración',
};

const AuditPage: React.FC = () => {
    const [entries, setEntries] = useState<AuditEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [entityFilter, setEntityFilter] = useState('');
    const [actionFilter, setActionFilter] = useState('');

    const fetchLog = useCallback(async () => {
        setLoading(true);
        try {
            const res = await statsApi.audit({
                page,
                limit: 50,
                entity: entityFilter || undefined,
                action: actionFilter || undefined,
            });
            setEntries(res.data);
            setPages(res.pages || 1);
            setTotal(res.total || 0);
        } catch (err) {
            console.error('Error al cargar bitácora:', err);
        } finally {
            setLoading(false);
        }
    }, [page, entityFilter, actionFilter]);

    useEffect(() => { fetchLog(); }, [fetchLog]);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Bitácora de Auditoría</h1>
                    <p className="text-sm text-slate-500">
                        Registro de todas las acciones sobre datos personales y del sistema · {total.toLocaleString()} eventos
                    </p>
                </div>
                <div className="flex gap-2">
                    <select
                        value={entityFilter}
                        onChange={e => { setEntityFilter(e.target.value); setPage(1); }}
                        className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white"
                    >
                        <option value="">Todos los módulos</option>
                        <option value="Person">Padrón</option>
                        <option value="Report">Reportes</option>
                        <option value="Event">Eventos</option>
                        <option value="User">Usuarios</option>
                        <option value="SystemConfig">Configuración</option>
                    </select>
                    <select
                        value={actionFilter}
                        onChange={e => { setActionFilter(e.target.value); setPage(1); }}
                        className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white"
                    >
                        <option value="">Todas las acciones</option>
                        <option value="CREATE">Creación</option>
                        <option value="UPDATE">Edición</option>
                        <option value="DELETE">Eliminación</option>
                        <option value="LOGIN">Inicios de sesión</option>
                    </select>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                {loading ? (
                    <div className="flex justify-center items-center py-20">
                        <i className="fas fa-circle-notch fa-spin text-2xl text-brand-primary"></i>
                    </div>
                ) : entries.length === 0 ? (
                    <p className="text-center text-slate-400 py-16">Sin eventos registrados con estos filtros.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100 bg-slate-50/50">
                                    <th className="py-3 px-4">Fecha y hora</th>
                                    <th className="py-3 px-4">Usuario</th>
                                    <th className="py-3 px-4">Acción</th>
                                    <th className="py-3 px-4">Módulo</th>
                                    <th className="py-3 px-4">Detalle</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entries.map(e => {
                                    const style = ACTION_STYLES[e.action] || { label: e.action, cls: 'bg-slate-100 text-slate-600', icon: 'fa-circle-info' };
                                    return (
                                        <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                                            <td className="py-2.5 px-4 whitespace-nowrap text-slate-500">
                                                {format(new Date(e.createdAt), "dd MMM yyyy · HH:mm", { locale: es })}
                                            </td>
                                            <td className="py-2.5 px-4">
                                                <span className="font-semibold text-slate-700">{e.username || 'Sistema'}</span>
                                                {e.role && <span className="text-[10px] text-slate-400 ml-1.5 uppercase">{e.role}</span>}
                                            </td>
                                            <td className="py-2.5 px-4">
                                                <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${style.cls}`}>
                                                    <i className={`fas ${style.icon} text-[9px]`}></i>
                                                    {style.label}
                                                </span>
                                            </td>
                                            <td className="py-2.5 px-4 text-slate-600">{ENTITY_LABELS[e.entity] || e.entity}</td>
                                            <td className="py-2.5 px-4 text-slate-500 max-w-[320px] truncate" title={e.detail || ''}>
                                                {e.detail || '—'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Paginación */}
                {pages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                        <button
                            disabled={page <= 1}
                            onClick={() => setPage(p => p - 1)}
                            className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
                        >
                            <i className="fas fa-chevron-left text-xs mr-1"></i> Anterior
                        </button>
                        <span className="text-xs text-slate-400">Página {page} de {pages}</span>
                        <button
                            disabled={page >= pages}
                            onClick={() => setPage(p => p + 1)}
                            className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
                        >
                            Siguiente <i className="fas fa-chevron-right text-xs ml-1"></i>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AuditPage;
