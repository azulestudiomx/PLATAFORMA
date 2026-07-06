import React, { useState, useEffect } from 'react';
import { statsApi } from '../services/api';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, AreaChart, Area, Legend
} from 'recharts';

interface Brigadista {
    username: string;
    name: string;
    role: string | null;
    reportes: number;
    reportes7dias: number;
    reportesResueltos: number;
    personas: number;
    personas7dias: number;
    capturas7dias: number;
}

interface BrigadasData {
    brigadistas: Brigadista[];
    porSeccion: { seccion: string; personas: number }[];
    actividad: { dia: string; reportes: number; personas: number }[];
    totales: { reportes: number; personas: number; resueltos: number; pendientes: number };
}

const StatCard: React.FC<{ icon: string; label: string; value: number; color: string }> = ({ icon, label, value, color }) => (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex items-center gap-4">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-white shrink-0 ${color}`}>
            <i className={`fas ${icon}`}></i>
        </div>
        <div>
            <p className="text-2xl font-bold text-slate-800 leading-tight">{value.toLocaleString()}</p>
            <p className="text-xs text-slate-500 font-medium">{label}</p>
        </div>
    </div>
);

const BrigadasPage: React.FC = () => {
    const [data, setData] = useState<BrigadasData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        statsApi.brigadas()
            .then(setData)
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-[50vh]">
                <i className="fas fa-circle-notch fa-spin text-3xl text-brand-primary"></i>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-6 text-center">
                <i className="fas fa-triangle-exclamation text-2xl mb-2"></i>
                <p>{error || 'No se pudieron cargar las estadísticas.'}</p>
            </div>
        );
    }

    const maxCapturas = Math.max(...data.brigadistas.map(b => b.reportes + b.personas), 1);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-800">Panel de Brigadas</h1>
                <p className="text-sm text-slate-500">Productividad del equipo de campo y avance territorial</p>
            </div>

            {/* Totales */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon="fa-folder-open" label="Reportes totales" value={data.totales.reportes} color="bg-red-800" />
                <StatCard icon="fa-address-book" label="Personas en padrón" value={data.totales.personas} color="bg-indigo-600" />
                <StatCard icon="fa-check-circle" label="Reportes resueltos" value={data.totales.resueltos} color="bg-emerald-600" />
                <StatCard icon="fa-hourglass-half" label="Pendientes" value={data.totales.pendientes} color="bg-amber-500" />
            </div>

            {/* Actividad diaria */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                <h2 className="font-bold text-slate-700 mb-4">
                    <i className="fas fa-chart-area text-brand-primary mr-2"></i>
                    Actividad de los últimos 30 días
                </h2>
                {data.actividad.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-8">Sin actividad registrada en el periodo.</p>
                ) : (
                    <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={data.actividad}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="dia" tick={{ fontSize: 10 }} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                            <Tooltip />
                            <Legend />
                            <Area type="monotone" dataKey="reportes" name="Reportes" stroke="#8B0000" fill="#8B000022" />
                            <Area type="monotone" dataKey="personas" name="Personas" stroke="#4f46e5" fill="#4f46e522" />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>

            {/* Ranking de brigadistas */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                <h2 className="font-bold text-slate-700 mb-4">
                    <i className="fas fa-ranking-star text-brand-primary mr-2"></i>
                    Ranking de capturistas
                </h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                                <th className="py-2 pr-3">#</th>
                                <th className="py-2 pr-3">Capturista</th>
                                <th className="py-2 pr-3 text-right">Reportes</th>
                                <th className="py-2 pr-3 text-right">Resueltos</th>
                                <th className="py-2 pr-3 text-right">Personas</th>
                                <th className="py-2 pr-3 text-right">Últimos 7 días</th>
                                <th className="py-2 w-1/4">Avance</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.brigadistas.map((b, i) => {
                                const total = b.reportes + b.personas;
                                return (
                                    <tr key={b.username} className="border-b border-slate-50 hover:bg-slate-50">
                                        <td className="py-2.5 pr-3 font-bold text-slate-400">{i + 1}</td>
                                        <td className="py-2.5 pr-3">
                                            <p className="font-semibold text-slate-700">{b.name}</p>
                                            <p className="text-[11px] text-slate-400">@{b.username}{b.role ? ` · ${b.role.toLowerCase()}` : ''}</p>
                                        </td>
                                        <td className="py-2.5 pr-3 text-right font-semibold">{b.reportes}</td>
                                        <td className="py-2.5 pr-3 text-right text-emerald-600 font-semibold">{b.reportesResueltos}</td>
                                        <td className="py-2.5 pr-3 text-right font-semibold">{b.personas}</td>
                                        <td className="py-2.5 pr-3 text-right">
                                            {b.capturas7dias > 0 ? (
                                                <span className="inline-block bg-emerald-50 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded-full">
                                                    +{b.capturas7dias}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-slate-300">—</span>
                                            )}
                                        </td>
                                        <td className="py-2.5">
                                            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                                <div
                                                    className="h-full rounded-full bg-gradient-to-r from-red-800 to-red-500"
                                                    style={{ width: `${Math.max((total / maxCapturas) * 100, 2)}%` }}
                                                />
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {data.brigadistas.length === 0 && (
                                <tr><td colSpan={7} className="py-8 text-center text-slate-400">Sin capturistas con actividad.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Avance por sección */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                <h2 className="font-bold text-slate-700 mb-4">
                    <i className="fas fa-map-location-dot text-brand-primary mr-2"></i>
                    Top 20 secciones por personas capturadas
                </h2>
                {data.porSeccion.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-8">Aún no hay personas con sección asignada.</p>
                ) : (
                    <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={data.porSeccion}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="seccion" tick={{ fontSize: 10 }} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                            <Tooltip />
                            <Bar dataKey="personas" name="Personas" fill="#8B0000" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </div>
        </div>
    );
};

export default BrigadasPage;
