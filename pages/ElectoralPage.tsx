import React, { useState, useEffect, useCallback, useRef } from 'react';
import { electoralApi } from '../services/api';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Cell, AreaChart, Area, Legend
} from 'recharts';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import Swal from 'sweetalert2';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface Seccion {
    seccion: number;
    municipio: string;
    casillas: number;
    total_votos: number;
    lista_nominal: number;
    participacion: number;
    votos_dormidos: number;
    semaforo: 'rojo' | 'amarillo' | 'verde';
    prioridad: string;
    ciudadanos_registrados: number;
    score_recuperacion: number;
}

interface Resumen {
    lista_nominal_total: number;
    votos_historicos_2024: number;
    participacion_historica: number;
    votos_esperados_2027: number;
    meta_votos: number;
    votos_dormidos: number;
    total_padron_registrado: number;
    cobertura_padron: number;
}

const PUESTOS = [
    { label: 'Presidente Municipal', value: 'presidente_municipal', icon: 'fa-city', pct: 0.50 },
    { label: 'Gobernador',           value: 'gobernador',           icon: 'fa-landmark', pct: 0.50 },
    { label: 'Diputado Local',       value: 'diputado_local',       icon: 'fa-gavel', pct: 0.40 },
    { label: 'Diputado Federal',     value: 'diputado_federal',     icon: 'fa-flag', pct: 0.40 },
];

const SEMAFORO_COLOR: Record<string, string> = {
    rojo:     '#ef4444',
    amarillo: '#f59e0b',
    verde:    '#22c55e',
};

const TABS = [
    { id: 'dashboard', label: 'Dashboard',    icon: 'fa-chart-pie' },
    { id: 'mapa',      label: 'Mapa de Calor', icon: 'fa-map-marked-alt' },
    { id: 'semaforo',  label: 'Semáforo',      icon: 'fa-traffic-light' },
    { id: 'calculadora', label: 'Calculadora', icon: 'fa-calculator' },
    { id: 'ia',        label: 'Consultor IA',  icon: 'fa-robot' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────
const ElectoralPage: React.FC = () => {
    const [activeTab, setActiveTab]   = useState('dashboard');
    const [puesto, setPuesto]         = useState(PUESTOS[0]);
    const [resumen, setResumen]       = useState<Resumen | null>(null);
    const [secciones, setSecciones]   = useState<Seccion[]>([]);
    const [loading, setLoading]       = useState(true);
    const [metaCustom, setMetaCustom] = useState<any>(null);

    // Calculadora state
    const [partEst, setPartEst]       = useState(63);
    const [pctNec, setPctNec]         = useState(50);
    const [brigadistas, setBrigadistas] = useState(100);
    const [diasCampaña, setDiasCampaña] = useState(90);

    // IA state
    const [pregunta, setPregunta]     = useState('');
    const [respuestaIA, setRespuestaIA] = useState('');
    const [loadingIA, setLoadingIA]   = useState(false);
    const [chatHistory, setChatHistory] = useState<{q: string; r: string}[]>([]);
    const chatRef = useRef<HTMLDivElement>(null);

    // Semaforo filters
    const [semaforoFilter, setSemaforoFilter] = useState<'todos' | 'rojo' | 'amarillo' | 'verde'>('todos');
    const [secSearch, setSecSearch]   = useState('');
    const [selectedSeccion, setSelectedSeccion] = useState<Seccion | null>(null);

    // ─── Fetch data ───────────────────────────────────────────────────────────
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [r, s] = await Promise.all([
                electoralApi.getResumen(),
                electoralApi.getSecciones(),
            ]);
            setResumen(r);
            setSecciones(s);
        } catch (err) {
            console.error('Electoral fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Cerrar modal con la tecla Escape
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setSelectedSeccion(null);
            }
        };
        if (selectedSeccion) {
            window.addEventListener('keydown', handleKeyDown);
        }
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [selectedSeccion]);

    // Recalcular meta cuando cambia el puesto
    useEffect(() => {
        if (!resumen) return;
        electoralApi.calcularMeta({
            participacion_estimada: partEst / 100,
            porcentaje_necesario: puesto.pct,
        }).then(setMetaCustom).catch(() => {});
    }, [puesto, partEst, resumen]);

    // ─── Secciones filtradas ──────────────────────────────────────────────────
    const seccionesFiltradas = secciones.filter(s => {
        const matchSemaforo = semaforoFilter === 'todos' || s.semaforo === semaforoFilter;
        const matchSearch = secSearch === '' || String(s.seccion).includes(secSearch);
        return matchSemaforo && matchSearch;
    });

    // ─── Calculadora ──────────────────────────────────────────────────────────
    const listaNominal  = resumen?.lista_nominal_total || 217472;
    const votosEsperados = Math.round(listaNominal * (partEst / 100));
    const metaVotos     = Math.round(votosEsperados * (pctNec / 100)) + 1;
    const votosActuales = resumen?.votos_historicos_2024 || 0;
    const gap           = Math.max(0, metaVotos - Math.round(votosActuales * (pctNec / 100)));
    const contactosDiarios = diasCampaña > 0 ? Math.ceil(gap / diasCampaña) : 0;
    const votosXBrigadista = brigadistas > 0 ? Math.ceil(gap / brigadistas) : gap;

    // ─── IA Consultor ─────────────────────────────────────────────────────────
    const handleAISubmit = async () => {
        if (!pregunta.trim()) return;
        setLoadingIA(true);
        const q = pregunta;
        setPregunta('');
        try {
            const data = await electoralApi.aiConsult(q, puesto.label);
            const entry = { q, r: data.respuesta };
            setChatHistory(prev => [...prev, entry]);
            setTimeout(() => chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' }), 100);
        } catch (err: any) {
            Swal.fire({ icon: 'error', title: 'Error IA', text: err.message });
        } finally {
            setLoadingIA(false);
        }
    };

    const getSeccionCoords = (seccion: number): [number, number] => {
        const seed = seccion * 9301 + 49297;
        const lat = 19.72 + ((seed % 1000) / 1000) * 0.30;
        
        // Estimación de la línea de costa (más al este a mayor latitud)
        const lngCoast = -90.58 + (lat - 19.80) * 1.6;
        
        // Evitamos caer al agua en el sur limitando la longitud mínima a -90.62
        const minLng = Math.max(lngCoast, -90.62);
        
        // Generamos la longitud al este de la costa
        const lng = minLng + ((seed % 700) / 700) * 0.30;
        return [lat, lng];
    };

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-96 gap-4">
                <div className="w-16 h-16 rounded-2xl bg-brand-gradient flex items-center justify-center shadow-glow-red animate-pulse">
                    <i className="fas fa-vote-yea text-white text-2xl"></i>
                </div>
                <p className="text-slate-400 font-medium text-sm">Cargando datos electorales...</p>
            </div>
        );
    }

    const meta = metaCustom || resumen;

    return (
        <div className="max-w-7xl mx-auto space-y-6 pb-24">

            {/* ── Header ───────────────────────────────────────────────────── */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div>
                    <h2 className="font-brand font-bold text-2xl text-gray-900 tracking-tight flex items-center gap-3">
                        <span className="w-9 h-9 rounded-xl bg-brand-gradient flex items-center justify-center shadow-glow-red shrink-0">
                            <i className="fas fa-brain text-white text-sm"></i>
                        </span>
                        Inteligencia Electoral
                    </h2>
                    <p className="text-sm text-gray-400 mt-0.5 ml-12">Análisis estratégico en tiempo real — Campeche 2027</p>
                </div>

                {/* Selector de puesto */}
                <div className="flex flex-wrap gap-2">
                    {PUESTOS.map(p => (
                        <button
                            key={p.value}
                            onClick={() => setPuesto(p)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                                puesto.value === p.value
                                    ? 'bg-brand-gradient text-white shadow-glow-red'
                                    : 'bg-white text-gray-500 border border-gray-100 hover:border-brand-primary/30'
                            }`}
                        >
                            <i className={`fas ${p.icon}`}></i>
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Tabs ─────────────────────────────────────────────────────── */}
            <div className="flex gap-1 bg-white rounded-2xl p-1.5 shadow-card border border-gray-50 overflow-x-auto">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap flex-1 justify-center ${
                            activeTab === tab.id
                                ? 'bg-brand-gradient text-white shadow-glow-red'
                                : 'text-gray-400 hover:bg-slate-50 hover:text-gray-600'
                        }`}
                    >
                        <i className={`fas ${tab.icon}`}></i>
                        <span className="hidden sm:inline">{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* TAB 1 — DASHBOARD ESTRATÉGICO                                 */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {activeTab === 'dashboard' && resumen && (
                <div className="space-y-6">
                    {/* KPI Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                            { label: 'Lista Nominal', value: resumen.lista_nominal_total.toLocaleString(), icon: 'fa-users', color: 'indigo', sub: 'electores registrados' },
                            { label: 'Votos Dormidos', value: resumen.votos_dormidos.toLocaleString(), icon: 'fa-moon', color: 'amber', sub: 'no votaron en 2024' },
                            { label: 'Meta para Ganar', value: (meta?.meta_votos || 0).toLocaleString(), icon: 'fa-trophy', color: 'red', sub: `con ${puesto.pct * 100}% de votos emitidos` },
                            { label: 'Padrón Registrado', value: resumen.total_padron_registrado.toLocaleString(), icon: 'fa-address-book', color: 'emerald', sub: `${(resumen.cobertura_padron * 100).toFixed(2)}% de cobertura` },
                        ].map((kpi, i) => (
                            <div key={i} className={`bg-white p-5 rounded-2xl shadow-card border border-gray-50 hover:border-${kpi.color}-200 transition-all group`}>
                                <div className="flex justify-between items-start mb-3">
                                    <div className={`w-10 h-10 rounded-xl bg-${kpi.color}-50 text-${kpi.color}-600 flex items-center justify-center`}>
                                        <i className={`fas ${kpi.icon} text-sm`}></i>
                                    </div>
                                </div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{kpi.label}</p>
                                <p className="text-2xl font-brand font-bold text-slate-800 leading-none">{kpi.value}</p>
                                <p className="text-[10px] text-gray-400 mt-1">{kpi.sub}</p>
                            </div>
                        ))}
                    </div>

                    {/* Barra de progreso hacia la meta */}
                    <div className="bg-white rounded-3xl shadow-card border border-gray-50 p-6">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h3 className="font-bold text-slate-800">Camino a la Victoria — {puesto.label}</h3>
                                <p className="text-xs text-gray-400">Basado en participación histórica 2024 ({(resumen.participacion_historica * 100).toFixed(1)}%)</p>
                            </div>
                            <span className="text-xs font-bold text-brand-primary bg-red-50 px-3 py-1 rounded-full">
                                {(resumen.participacion_historica * 100).toFixed(1)}% participación 2024
                            </span>
                        </div>

                        <div className="grid grid-cols-3 gap-4 mb-6">
                            {[
                                { label: 'Votos esperados 2027', value: resumen.votos_esperados_2027.toLocaleString(), color: '#6366f1' },
                                { label: 'Tu meta de votos', value: (meta?.meta_votos || 0).toLocaleString(), color: '#8B0000' },
                                { label: 'Votos a recuperar', value: resumen.votos_dormidos.toLocaleString(), color: '#f59e0b' },
                            ].map((item, i) => (
                                <div key={i} className="text-center p-4 rounded-2xl bg-slate-50">
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">{item.label}</p>
                                    <p className="text-2xl font-brand font-bold" style={{ color: item.color }}>{item.value}</p>
                                </div>
                            ))}
                        </div>

                        {/* Progress bar */}
                        <div className="relative">
                            <div className="flex justify-between text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                                <span>0</span>
                                <span>Meta: {(meta?.meta_votos || 0).toLocaleString()}</span>
                                <span>{resumen.votos_esperados_2027.toLocaleString()}</span>
                            </div>
                            <div className="h-4 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-brand-gradient rounded-full transition-all duration-1000 relative"
                                    style={{ width: `${Math.min(100, ((meta?.meta_votos || 0) / resumen.votos_esperados_2027) * 100)}%` }}
                                >
                                    <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full"></div>
                                </div>
                            </div>
                            <p className="text-center text-xs text-gray-400 mt-2">
                                Necesitas el <span className="font-bold text-brand-primary">{(puesto.pct * 100).toFixed(0)}%</span> de los votos emitidos para ganar
                            </p>
                        </div>
                    </div>

                    {/* Gráfica Top 10 secciones prioritarias */}
                    <div className="bg-white rounded-3xl shadow-card border border-gray-50 p-6">
                        <h3 className="font-bold text-slate-800 mb-1">Top 10 Secciones con más Votos Dormidos</h3>
                        <p className="text-xs text-gray-400 mb-4">Mayor potencial de recuperación electoral — prioridad de brigadas</p>
                        <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={secciones.slice(0, 10).map(s => ({ name: `Secc. ${s.seccion}`, dormidos: s.votos_dormidos, registrados: s.ciudadanos_registrados }))}
                                    layout="vertical"
                                    margin={{ top: 0, right: 20, left: 60, bottom: 0 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} width={60} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '15px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
                                        formatter={(val: any, name: string) => [val.toLocaleString(), name === 'dormidos' ? 'Votos dormidos' : 'Ciudadanos en padrón']}
                                    />
                                    <Legend formatter={(v) => v === 'dormidos' ? 'Votos dormidos' : 'En padrón'} />
                                    <Bar dataKey="dormidos" radius={[0, 8, 8, 0]} barSize={16}>
                                        {secciones.slice(0, 10).map((s, i) => (
                                            <Cell key={i} fill={SEMAFORO_COLOR[s.semaforo]} fillOpacity={0.85} />
                                        ))}
                                    </Bar>
                                    <Bar dataKey="registrados" fill="#6366f1" radius={[0, 8, 8, 0]} barSize={8} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* TAB 2 — MAPA DE CALOR ELECTORAL                               */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {activeTab === 'mapa' && (
                <div className="space-y-4">
                    {/* Leyenda */}
                    <div className="bg-white rounded-2xl shadow-card border border-gray-50 p-4 flex flex-wrap gap-4 items-center">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Semáforo de Participación:</p>
                        {[
                            { color: '#ef4444', label: '< 55% — CRÍTICA (máxima atención)' },
                            { color: '#f59e0b', label: '55–70% — MEDIA (fortalecer)' },
                            { color: '#22c55e', label: '> 70% — CONSOLIDADA (mantener)' },
                        ].map((item, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                                <span className="text-xs font-medium text-gray-600">{item.label}</span>
                            </div>
                        ))}
                        <p className="text-xs text-gray-400 ml-auto">Tamaño = votos dormidos</p>
                    </div>

                    {/* Mapa */}
                    <div className="bg-white rounded-3xl shadow-card border border-gray-50 overflow-hidden" style={{ height: '600px' }}>
                        <MapContainer center={[19.85, -90.53]} zoom={11} style={{ height: '100%', width: '100%' }}>
                            <TileLayer
                                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                                attribution='&copy; OpenStreetMap contributors &copy; CARTO'
                            />
                            {secciones.map((s) => {
                                const [lat, lng] = getSeccionCoords(s.seccion);
                                const radius = Math.max(8, Math.min(35, s.votos_dormidos / 120));
                                return (
                                    <CircleMarker
                                        key={s.seccion}
                                        center={[lat, lng]}
                                        radius={radius}
                                        fillColor={SEMAFORO_COLOR[s.semaforo]}
                                        color={SEMAFORO_COLOR[s.semaforo]}
                                        weight={1.5}
                                        opacity={0.9}
                                        fillOpacity={0.65}
                                    >
                                        <Popup
                                            autoPan={true}
                                            autoPanPadding={[20, 20]}
                                            keepInView={true}
                                            maxWidth={240}
                                            minWidth={220}
                                        >
                                            <div style={{ padding: '6px 4px', minWidth: '210px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                                                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: SEMAFORO_COLOR[s.semaforo], flexShrink: 0 }}></div>
                                                    <span style={{ fontWeight: 700, fontSize: '14px', color: '#1e293b' }}>Sección {s.seccion}</span>
                                                    <span style={{ marginLeft: 'auto', fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '999px', backgroundColor: SEMAFORO_COLOR[s.semaforo] + '22', color: SEMAFORO_COLOR[s.semaforo], whiteSpace: 'nowrap' }}>
                                                        {s.prioridad}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '12px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#6b7280' }}>Lista Nominal:</span><span style={{ fontWeight: 700 }}>{s.lista_nominal.toLocaleString()}</span></div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#6b7280' }}>Votos 2024:</span><span style={{ fontWeight: 700 }}>{s.total_votos.toLocaleString()}</span></div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#6b7280' }}>Participación:</span><span style={{ fontWeight: 700, color: SEMAFORO_COLOR[s.semaforo] }}>{(s.participacion * 100).toFixed(1)}%</span></div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e5e7eb', paddingTop: '5px', marginTop: '3px' }}><span style={{ color: '#6b7280', fontWeight: 700 }}>Votos Dormidos:</span><span style={{ fontWeight: 700, color: '#d97706' }}>{s.votos_dormidos.toLocaleString()}</span></div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#6b7280' }}>Casillas:</span><span style={{ fontWeight: 700 }}>{s.casillas}</span></div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#6b7280' }}>En tu padrón:</span><span style={{ fontWeight: 700, color: '#4f46e5' }}>{s.ciudadanos_registrados}</span></div>
                                                </div>
                                            </div>
                                        </Popup>
                                    </CircleMarker>
                                );
                            })}
                        </MapContainer>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* TAB 3 — SEMÁFORO DE SECCIONES                                 */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {activeTab === 'semaforo' && (
                <div className="space-y-4">
                    {/* Stats por semáforo */}
                    <div className="grid grid-cols-3 gap-4">
                        {(['rojo', 'amarillo', 'verde'] as const).map(color => {
                            const count = secciones.filter(s => s.semaforo === color).length;
                            const dormidos = secciones.filter(s => s.semaforo === color).reduce((a, s) => a + s.votos_dormidos, 0);
                            const labels = { rojo: 'Críticas', amarillo: 'En Riesgo', verde: 'Consolidadas' };
                            return (
                                <button
                                    key={color}
                                    onClick={() => setSemaforoFilter(semaforoFilter === color ? 'todos' : color)}
                                    className={`bg-white p-4 rounded-2xl shadow-card border-2 transition-all text-left ${semaforoFilter === color ? 'border-current' : 'border-transparent hover:border-gray-100'}`}
                                    style={{ borderColor: semaforoFilter === color ? SEMAFORO_COLOR[color] : undefined }}
                                >
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: SEMAFORO_COLOR[color] }}></div>
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{labels[color]}</span>
                                    </div>
                                    <p className="text-2xl font-brand font-bold text-slate-800">{count}</p>
                                    <p className="text-xs text-gray-400">{dormidos.toLocaleString()} votos dormidos</p>
                                </button>
                            );
                        })}
                    </div>

                    {/* Tabla */}
                    <div className="bg-white rounded-3xl shadow-card border border-gray-50 overflow-hidden">
                        <div className="p-4 border-b border-gray-50 flex gap-3 items-center">
                            <div className="relative flex-1">
                                <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 text-xs"></i>
                                <input
                                    type="text"
                                    placeholder="Buscar sección..."
                                    value={secSearch}
                                    onChange={e => setSecSearch(e.target.value)}
                                    className="input-modern pl-9 h-10 text-sm bg-slate-50 border-none w-full"
                                />
                            </div>
                            <button
                                onClick={() => setSemaforoFilter('todos')}
                                className={`px-4 h-10 rounded-xl text-xs font-bold transition-all ${semaforoFilter === 'todos' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-gray-500 hover:bg-slate-200'}`}
                            >
                                Todas ({secciones.length})
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full">
                                <thead>
                                    <tr className="bg-slate-50/50">
                                        <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Sección</th>
                                        <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-400 uppercase tracking-widest">Lista Nominal</th>
                                        <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-400 uppercase tracking-widest">Votos 2024</th>
                                        <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-400 uppercase tracking-widest">Participación</th>
                                        <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-400 uppercase tracking-widest">Votos Dormidos</th>
                                        <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-400 uppercase tracking-widest">Casillas</th>
                                        <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-400 uppercase tracking-widest">En Padrón</th>
                                        <th className="px-4 py-3 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">Prioridad</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {seccionesFiltradas.map((s, i) => (
                                        <tr
                                            key={s.seccion}
                                            className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                                            onClick={() => setSelectedSeccion(s)}
                                        >
                                            <td className="px-4 py-3">
                                                <span className="font-mono font-bold text-sm text-slate-700">{s.seccion}</span>
                                            </td>
                                            <td className="px-4 py-3 text-right text-sm text-slate-600">{s.lista_nominal.toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right text-sm text-slate-600">{s.total_votos.toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                        <div className="h-full rounded-full" style={{ width: `${s.participacion * 100}%`, backgroundColor: SEMAFORO_COLOR[s.semaforo] }}></div>
                                                    </div>
                                                    <span className="text-xs font-bold" style={{ color: SEMAFORO_COLOR[s.semaforo] }}>{(s.participacion * 100).toFixed(1)}%</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <span className="font-bold text-amber-600">{s.votos_dormidos.toLocaleString()}</span>
                                            </td>
                                            <td className="px-4 py-3 text-right text-sm text-slate-500">{s.casillas}</td>
                                            <td className="px-4 py-3 text-right">
                                                <span className={`font-bold text-sm ${s.ciudadanos_registrados > 0 ? 'text-indigo-600' : 'text-gray-300'}`}>
                                                    {s.ciudadanos_registrados}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: SEMAFORO_COLOR[s.semaforo] + '18', color: SEMAFORO_COLOR[s.semaforo] }}>
                                                    {s.prioridad}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="p-3 border-t border-gray-50 text-center text-xs text-gray-400">
                            Mostrando {seccionesFiltradas.length} de {secciones.length} secciones
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* TAB 4 — CALCULADORA DE VICTORIA                               */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {activeTab === 'calculadora' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Sliders */}
                    <div className="bg-white rounded-3xl shadow-card border border-gray-50 p-6 space-y-6">
                        <div>
                            <h3 className="font-bold text-slate-800 mb-1">Parámetros de la Elección</h3>
                            <p className="text-xs text-gray-400">Ajusta los escenarios para calcular tu meta de victoria</p>
                        </div>

                        {[
                            { label: 'Participación estimada 2027', value: partEst, setValue: setPartEst, min: 30, max: 90, suffix: '%', color: '#6366f1', hint: `En 2024 fue ${(resumen?.participacion_historica || 0.633 * 100).toFixed(1)}%` },
                            { label: '% de votos que necesitas ganar', value: pctNec, setValue: setPctNec, min: 30, max: 60, suffix: '%', color: '#8B0000', hint: '50% mayoría simple · 40% si hay 3+ candidatos' },
                            { label: 'Brigadistas en tu estructura', value: brigadistas, setValue: setBrigadistas, min: 10, max: 2000, suffix: '', color: '#059669', hint: 'Personas activas que pueden movilizar votos' },
                            { label: 'Días de campaña disponibles', value: diasCampaña, setValue: setDiasCampaña, min: 7, max: 180, suffix: ' días', color: '#f59e0b', hint: 'Tiempo real de trabajo de campo' },
                        ].map((s, i) => (
                            <div key={i}>
                                <div className="flex justify-between items-baseline mb-2">
                                    <label className="text-sm font-semibold text-slate-700">{s.label}</label>
                                    <span className="text-xl font-brand font-bold" style={{ color: s.color }}>{s.value.toLocaleString()}{s.suffix}</span>
                                </div>
                                <input
                                    type="range"
                                    min={s.min}
                                    max={s.max}
                                    value={s.value}
                                    onChange={e => s.setValue(Number(e.target.value))}
                                    className="w-full slider-custom cursor-pointer"
                                    style={{ '--accent-color': s.color, accentColor: s.color } as React.CSSProperties}
                                />
                                <p className="text-[10px] text-gray-400 mt-1">{s.hint}</p>
                            </div>
                        ))}
                    </div>

                    {/* Resultados */}
                    <div className="space-y-4">
                        <div className="bg-brand-gradient rounded-3xl p-6 text-white shadow-glow-red">
                            <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-1">META PARA GANAR</p>
                            <p className="text-5xl font-brand font-bold mb-1">{metaVotos.toLocaleString()}</p>
                            <p className="text-white/70 text-sm">votos necesarios — {puesto.label}</p>
                        </div>

                        {[
                            { label: 'Votos esperados en 2027', value: votosEsperados.toLocaleString(), icon: 'fa-chart-line', color: '#6366f1', bg: '#eef2ff' },
                            { label: 'Votos que te faltan cubrir', value: gap.toLocaleString(), icon: 'fa-exclamation-triangle', color: '#f59e0b', bg: '#fffbeb' },
                            { label: 'Votos requeridos por brigadista', value: votosXBrigadista.toLocaleString(), icon: 'fa-user-check', color: '#059669', bg: '#f0fdf4' },
                            { label: 'Contactos diarios necesarios', value: contactosDiarios.toLocaleString(), icon: 'fa-calendar-check', color: '#8B0000', bg: '#fff1f2' },
                        ].map((item, i) => (
                            <div key={i} className="bg-white rounded-2xl shadow-card border border-gray-50 p-4 flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: item.bg }}>
                                    <i className={`fas ${item.icon} text-sm`} style={{ color: item.color }}></i>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{item.label}</p>
                                    <p className="text-xl font-brand font-bold" style={{ color: item.color }}>{item.value}</p>
                                </div>
                            </div>
                        ))}

                        <div className="bg-slate-50 rounded-2xl p-4 text-xs text-gray-400">
                            <i className="fas fa-info-circle mr-2 text-indigo-400"></i>
                            Con <strong>{brigadistas.toLocaleString()} brigadistas</strong> activos durante <strong>{diasCampaña} días</strong>, cada uno necesita contactar a <strong>{votosXBrigadista} personas</strong> en total, equivalente a <strong>{Math.ceil(votosXBrigadista / diasCampaña)} contactos diarios</strong> por brigadista.
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* TAB 5 — CONSULTOR IA                                          */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {activeTab === 'ia' && (
                <div className="space-y-4">
                    {/* Header IA */}
                    <div className="bg-brand-gradient rounded-3xl p-6 text-white shadow-glow-red flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
                            <i className="fas fa-robot text-2xl"></i>
                        </div>
                        <div>
                            <h3 className="font-brand font-bold text-lg">Consultor Táctico IA</h3>
                            <p className="text-white/70 text-sm">Estrategia personalizada para <strong>{puesto.label}</strong> con datos reales de Campeche 2027</p>
                        </div>
                        <div className="ml-auto text-right hidden sm:block">
                            <p className="text-white/50 text-[10px] uppercase tracking-widest">Contexto activo</p>
                            <p className="text-white font-bold text-sm">151 secciones · {secciones.reduce((a,s)=>a+s.votos_dormidos,0).toLocaleString()} votos dormidos</p>
                        </div>
                    </div>

                    {/* Sugerencias rápidas */}
                    {chatHistory.length === 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {[
                                '¿Cuáles son las 5 secciones más urgentes de trabajar y por qué?',
                                '¿Cómo distribuyo a mis brigadistas para maximizar votos?',
                                'Dame un plan de trabajo para los próximos 30 días',
                                '¿Cuál es el perfil del votante no participante en las secciones críticas?',
                            ].map((q, i) => (
                                <button
                                    key={i}
                                    onClick={() => { setPregunta(q); }}
                                    className="text-left p-4 rounded-2xl border border-gray-100 bg-white hover:border-brand-primary/30 hover:bg-red-50/30 transition-all group"
                                >
                                    <i className="fas fa-lightbulb text-amber-400 mr-2 text-xs group-hover:text-brand-primary transition-colors"></i>
                                    <span className="text-sm text-slate-600 group-hover:text-slate-800">{q}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Chat */}
                    <div ref={chatRef} className="bg-white rounded-3xl shadow-card border border-gray-50 overflow-hidden flex flex-col" style={{ minHeight: '400px', maxHeight: '520px' }}>
                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            {chatHistory.length === 0 && (
                                <div className="flex flex-col items-center justify-center h-48 text-gray-300 gap-3">
                                    <i className="fas fa-comments text-4xl"></i>
                                    <p className="text-sm font-medium">Haz una pregunta estratégica para comenzar</p>
                                </div>
                            )}
                            {chatHistory.map((entry, i) => (
                                <div key={i} className="space-y-3">
                                    {/* Pregunta */}
                                    <div className="flex justify-end">
                                        <div className="bg-brand-gradient text-white px-4 py-3 rounded-2xl rounded-tr-sm max-w-[80%] text-sm shadow-glow-red">
                                            {entry.q}
                                        </div>
                                    </div>
                                    {/* Respuesta */}
                                    <div className="flex items-start gap-3">
                                        <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                                            <i className="fas fa-robot text-slate-500 text-xs"></i>
                                        </div>
                                        <div className="bg-slate-50 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%] text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                                            {entry.r}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {loadingIA && (
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
                                        <i className="fas fa-robot text-slate-500 text-xs"></i>
                                    </div>
                                    <div className="bg-slate-50 rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1.5">
                                        {[0,1,2].map(d => (
                                            <div key={d} className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: `${d * 0.15}s` }}></div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Input */}
                        <div className="p-4 border-t border-gray-50">
                            <div className="flex gap-3">
                                <input
                                    type="text"
                                    value={pregunta}
                                    onChange={e => setPregunta(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && !loadingIA && handleAISubmit()}
                                    placeholder={`Pregunta sobre tu campaña para ${puesto.label}...`}
                                    disabled={loadingIA}
                                    className="input-modern flex-1 h-11 text-sm bg-slate-50 border-none"
                                />
                                <button
                                    onClick={handleAISubmit}
                                    disabled={loadingIA || !pregunta.trim()}
                                    className="btn-primary h-11 px-5 shadow-glow-red disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loadingIA ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-paper-plane"></i>}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal de sección seleccionada ─────────────────────────── */}
            {selectedSeccion && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md" onClick={() => setSelectedSeccion(null)}>
                    <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-fade-in" onClick={e => e.stopPropagation()}>
                        <div className="p-5 flex justify-between items-center" style={{ borderBottom: `3px solid ${SEMAFORO_COLOR[selectedSeccion.semaforo]}` }}>
                            <div>
                                <h3 className="font-brand font-bold text-lg text-slate-800">Sección {selectedSeccion.seccion}</h3>
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: SEMAFORO_COLOR[selectedSeccion.semaforo] + '18', color: SEMAFORO_COLOR[selectedSeccion.semaforo] }}>
                                    {selectedSeccion.prioridad}
                                </span>
                            </div>
                            <button onClick={() => setSelectedSeccion(null)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-all">
                                <i className="fas fa-times text-xs text-gray-500"></i>
                            </button>
                        </div>
                        <div className="p-5 space-y-3">
                            {[
                                { label: 'Lista Nominal', value: selectedSeccion.lista_nominal.toLocaleString(), icon: 'fa-users' },
                                { label: 'Votos emitidos 2024', value: selectedSeccion.total_votos.toLocaleString(), icon: 'fa-vote-yea' },
                                { label: 'Participación histórica', value: `${(selectedSeccion.participacion * 100).toFixed(1)}%`, icon: 'fa-percentage', valueColor: SEMAFORO_COLOR[selectedSeccion.semaforo] },
                                { label: 'Votos dormidos (oportunidad)', value: selectedSeccion.votos_dormidos.toLocaleString(), icon: 'fa-moon', valueColor: '#f59e0b' },
                                { label: 'Casillas electorales', value: selectedSeccion.casillas, icon: 'fa-box' },
                                { label: 'Ciudadanos en tu padrón', value: selectedSeccion.ciudadanos_registrados, icon: 'fa-address-book', valueColor: selectedSeccion.ciudadanos_registrados > 0 ? '#6366f1' : '#d1d5db' },
                            ].map((item, i) => (
                                <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                                    <div className="flex items-center gap-2">
                                        <i className={`fas ${item.icon} text-gray-400 text-xs w-4`}></i>
                                        <span className="text-sm text-gray-600">{item.label}</span>
                                    </div>
                                    <span className="font-bold text-sm" style={{ color: (item as any).valueColor || '#1e293b' }}>{item.value}</span>
                                </div>
                            ))}

                            {/* Insight */}
                            <div className="p-3 rounded-xl bg-amber-50 border border-amber-100">
                                <p className="text-xs text-amber-700">
                                    <i className="fas fa-lightbulb mr-2"></i>
                                    <strong>Potencial:</strong> Si activas el {Math.min(30, Math.round((selectedSeccion.votos_dormidos * 0.3))).toLocaleString()} de los {selectedSeccion.votos_dormidos.toLocaleString()} votos dormidos, ganas {Math.round(selectedSeccion.votos_dormidos * 0.15).toLocaleString()} votos adicionales para tu candidato.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ElectoralPage;
