import React, { useState, useEffect, useCallback, useRef } from 'react';
import { electoralApi } from '../services/api';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Cell, AreaChart, Area, Legend
} from 'recharts';
import { MapContainer, TileLayer, GeoJSON, Popup } from 'react-leaflet';
import type { Layer, PathOptions, GeoJSONOptions } from 'leaflet';
import campecheGeo from '../src/campeche_secciones_wgs84.json';
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
    // GeoJSON metadata
    distrito_f?:       number | null;
    distrito_l?:       number | null;
    municipio_id?:     number | null;
    municipio_nombre?: string | null;
    tipo?:             number | null;
    tipo_nombre?:      string | null;

    // Resultados electorales reales por partido/coalición
    votos_pan?: number;
    votos_pri?: number;
    votos_prd?: number;
    votos_pt?: number;
    votos_verde?: number;
    votos_mc?: number;
    votos_morena?: number;
    votos_pes?: number;
    votos_campeche_libre?: number;
    votos_espacio_democratico?: number;
    votos_movimiento_laborista?: number;
    votos_pri_prd?: number;
    votos_pt_verde_morena?: number;
    votos_pt_verde?: number;
    votos_pt_morena?: number;
    votos_verde_morena?: number;
    votos_coalicion_morena?: number;
    votos_coalicion_pri_prd?: number;
    votos_otros?: number;

    ganador?: string;
    ganador_votos?: number;
    ganador_color?: string;
    ganador_label?: string;
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

const MUNICIPIO_NOMBRES: Record<number, string> = {
    1: 'Campeche',    2: 'Calkiní',     3: 'Carmen',      4: 'Champotón',
    5: 'Hecelchakán', 6: 'Hopelchén',   7: 'Palizada',    8: 'Tenabo',
    9: 'Escárcega',   10: 'Candelaria', 11: 'Calakmul',   12: 'Dzitbalché',
    13: 'Seybaplaya',
};
const TIPO_LABELS: Record<number, string> = { 2: '🏙️ Urbana', 3: '🏘️ Mixta', 4: '🌾 Rural' };

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
    const [municipioFilter, setMunicipioFilter] = useState<string>('');
    const [selectedSeccion, setSelectedSeccion] = useState<Seccion | null>(null);

    // Mapa filters
    const [mapaDistritoF, setMapaDistritoF] = useState<string>('');
    const [mapaDistritoL, setMapaDistritoL] = useState<string>('');
    const [mapaTipo, setMapaTipo]           = useState<string>('');
    const [mapMode, setMapMode]             = useState<'semaforo' | 'ganador'>('semaforo');

    // Paginación
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;

    const municipiosDisponibles = React.useMemo(() => {
        const set = new Set(secciones.map(s => s.municipio).filter(Boolean));
        return Array.from(set).sort();
    }, [secciones]);

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
    const seccionesFiltradas = React.useMemo(() => {
        return secciones.filter(s => {
            const matchSemaforo = semaforoFilter === 'todos' || s.semaforo === semaforoFilter;
            
            // Búsqueda: coincide con sección (número) o municipio (texto)
            const query = secSearch.toLowerCase().trim();
            const matchSearch = query === '' || 
                String(s.seccion).includes(query) || 
                (s.municipio && s.municipio.toLowerCase().includes(query));
                
            // Filtro por Municipio
            const matchMunicipio = municipioFilter === '' || s.municipio === municipioFilter;
            
            return matchSemaforo && matchSearch && matchMunicipio;
        });
    }, [secciones, semaforoFilter, secSearch, municipioFilter]);

    // Resetear a página 1 cuando cambia algún filtro
    useEffect(() => {
        setCurrentPage(1);
    }, [semaforoFilter, secSearch, municipioFilter]);

    const totalPages = Math.ceil(seccionesFiltradas.length / itemsPerPage) || 1;
    
    const seccionesPaginadas = React.useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return seccionesFiltradas.slice(start, start + itemsPerPage);
    }, [seccionesFiltradas, currentPage]);

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

    // Lookup rápido seccion → datos electorales (para el mapa GeoJSON)
    const seccionesMap = React.useMemo(() => {
        const map = new Map<number, Seccion>();
        secciones.forEach(s => map.set(Number(s.seccion), s));
        return map;
    }, [secciones]);

    // Estilo dinámico por feature GeoJSON
    const getGeoStyle = React.useCallback((feature: any): PathOptions => {
        const seccion = Number(feature?.properties?.seccion);
        const data = seccionesMap.get(seccion);
        if (!data) return {
            fillColor: '#94a3b8',
            fillOpacity: 0.07,
            color: '#cbd5e1',
            weight: 0.8,
            opacity: 0.4,
        };

        const fillColor = mapMode === 'semaforo'
            ? SEMAFORO_COLOR[data.semaforo]
            : (data.ganador_color || '#94a3b8');

        // Opacidad basada en votos dormidos (para semáforo) o fija (para ganador)
        const maxDormidos = 6000;
        const fillOpacity = mapMode === 'semaforo'
            ? 0.25 + Math.min(0.55, (data.votos_dormidos / maxDormidos) * 0.55)
            : (data.ganador === 'SIN_DATOS' ? 0.07 : 0.65);

        return {
            fillColor,
            fillOpacity,
            color: '#fff',
            weight: 1.0,
            opacity: 0.8,
        };
    }, [seccionesMap, mapMode]);

    // Filtro del GeoJSON
    const geoFilterFn = React.useCallback((feature: any): boolean => {
        const p = feature?.properties;
        if (!p) return true;
        if (mapaDistritoF && Number(p.distrito_f) !== Number(mapaDistritoF)) return false;
        if (mapaDistritoL && Number(p.distrito_l) !== Number(mapaDistritoL)) return false;
        if (mapaTipo     && Number(p.tipo)       !== Number(mapaTipo))       return false;
        return true;
    }, [mapaDistritoF, mapaDistritoL, mapaTipo]);

    // clave para forzar re-render de GeoJSON cuando cambian filtros o datos
    const geoKey = `geo-${mapaDistritoF}-${mapaDistritoL}-${mapaTipo}-${mapMode}-${secciones.length}`;

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
            {/* TAB 2 — MAPA DE CALOR ELECTORAL (GeoJSON Polygons)             */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {activeTab === 'mapa' && (
                <div className="space-y-4">

                    {/* Leyenda + filtros */}
                    <div className="bg-white rounded-2xl shadow-card border border-gray-50 p-4 flex flex-wrap gap-4 items-center">
                        {/* Toggle de Modo de Mapa */}
                        <div className="flex bg-slate-100 p-1 rounded-xl gap-1 shrink-0">
                            <button
                                onClick={() => setMapMode('semaforo')}
                                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${mapMode === 'semaforo' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-800'}`}
                            >
                                <i className="fas fa-traffic-light mr-1"></i>Semáforo
                            </button>
                            <button
                                onClick={() => setMapMode('ganador')}
                                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${mapMode === 'ganador' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-800'}`}
                            >
                                <i className="fas fa-trophy mr-1"></i>Ganador 2024
                            </button>
                        </div>

                        {/* Leyenda */}
                        <div className="flex flex-wrap items-center gap-3">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest shrink-0">
                                {mapMode === 'semaforo' ? 'Participación:' : 'Ganador 2024:'}
                            </p>
                            {mapMode === 'semaforo' ? (
                                [
                                    { color: '#ef4444', label: '< 55% Crítica' },
                                    { color: '#f59e0b', label: '55–70% Media' },
                                    { color: '#22c55e', label: '> 70% Consolidada' },
                                    { color: '#94a3b8', label: 'Sin datos' },
                                ].map((item, i) => (
                                    <div key={i} className="flex items-center gap-1.5 font-semibold text-xs text-gray-600">
                                        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }}></div>
                                        <span>{item.label}</span>
                                    </div>
                                ))
                            ) : (
                                [
                                    { color: '#800020', label: 'MORENA-PT-PVEM' },
                                    { color: '#FF8C00', label: 'MC' },
                                    { color: '#1E5A34', label: 'PRI-PRD' },
                                    { color: '#1A535C', label: 'PAN' },
                                    { color: '#708090', label: 'Otros' },
                                    { color: '#94a3b8', label: 'Sin Datos' },
                                ].map((item, i) => (
                                    <div key={i} className="flex items-center gap-1.5 font-semibold text-xs text-gray-600">
                                        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }}></div>
                                        <span>{item.label}</span>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Filtros de distrito y tipo */}
                        <div className="flex flex-wrap items-center gap-2 ml-auto">
                            {/* Distrito Federal */}
                            <select
                                value={mapaDistritoF}
                                onChange={e => setMapaDistritoF(e.target.value)}
                                className="h-8 px-3 rounded-xl border border-gray-200 bg-slate-50 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200 cursor-pointer"
                            >
                                <option value="">Dist. Federal: Todos</option>
                                <option value="1">Distrito Federal 1</option>
                                <option value="2">Distrito Federal 2</option>
                            </select>

                            {/* Distrito Local */}
                            <select
                                value={mapaDistritoL}
                                onChange={e => setMapaDistritoL(e.target.value)}
                                className="h-8 px-3 rounded-xl border border-gray-200 bg-slate-50 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200 cursor-pointer"
                            >
                                <option value="">Dist. Local: Todos</option>
                                {Array.from({ length: 21 }, (_, i) => i + 1).map(d => (
                                    <option key={d} value={String(d)}>Distrito Local {d}</option>
                                ))}
                            </select>

                            {/* Tipo de sección */}
                            <select
                                value={mapaTipo}
                                onChange={e => setMapaTipo(e.target.value)}
                                className="h-8 px-3 rounded-xl border border-gray-200 bg-slate-50 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200 cursor-pointer"
                            >
                                <option value="">Tipo: Todos</option>
                                <option value="2">🏙️ Urbana</option>
                                <option value="3">🏘️ Mixta</option>
                                <option value="4">🌾 Rural</option>
                            </select>

                            {/* Limpiar filtros */}
                            {(mapaDistritoF || mapaDistritoL || mapaTipo) && (
                                <button
                                    onClick={() => { setMapaDistritoF(''); setMapaDistritoL(''); setMapaTipo(''); }}
                                    className="h-8 px-3 rounded-xl bg-red-50 text-red-500 text-xs font-bold hover:bg-red-100 transition-colors"
                                >
                                    <i className="fas fa-times mr-1"></i>Limpiar
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Mapa GeoJSON */}
                    <div className="bg-white rounded-3xl shadow-card border border-gray-50 overflow-hidden" style={{ height: '640px' }}>
                        <MapContainer
                            center={[18.5, -90.0]}
                            zoom={7}
                            style={{ height: '100%', width: '100%' }}
                        >
                            <TileLayer
                                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                                attribution='&copy; OpenStreetMap contributors &copy; CARTO'
                            />
                            <GeoJSON
                                key={geoKey}
                                data={campecheGeo as any}
                                style={getGeoStyle}
                                filter={geoFilterFn}
                                onEachFeature={(feature: any, layer: Layer) => {
                                    const seccion = Number(feature?.properties?.seccion);
                                    const data    = seccionesMap.get(seccion);
                                    const p       = feature?.properties || {};
                                    const muniNombre = MUNICIPIO_NOMBRES[Number(p.municipio)] || `Municipio ${p.municipio}`;
                                    const tipoLabel  = TIPO_LABELS[Number(p.tipo)] || '—';

                                    // Hover
                                    (layer as any).on('mouseover', function (this: any) {
                                        const base = (this.options as PathOptions).fillOpacity || 0.3;
                                        this.setStyle({
                                            fillOpacity: Math.min(0.92, base + 0.25),
                                            weight: 2.0,
                                            color: '#ffffff',
                                        });
                                    });
                                    (layer as any).on('mouseout', function (this: any) {
                                        (layer as any).setStyle(getGeoStyle(feature));
                                    });

                                    // Popup
                                    const color = data ? SEMAFORO_COLOR[data.semaforo] : '#94a3b8';
                                    const popupContent = `
                                        <div style="padding:6px 4px;min-width:220px;font-family:system-ui,sans-serif">
                                            <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px">
                                                <div style="width:10px;height:10px;border-radius:3px;background:${color};flex-shrink:0"></div>
                                                <span style="font-weight:700;font-size:14px;color:#1e293b">Sección ${seccion}</span>
                                                ${data ? `<span style="margin-left:auto;font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px;background:${color}22;color:${color}">${data.prioridad}</span>` : '<span style="margin-left:auto;font-size:10px;color:#94a3b8">Sin datos</span>'}
                                            </div>
                                            <div style="display:flex;flex-direction:column;gap:5px;font-size:12px">
                                                <div style="display:flex;justify-content:space-between"><span style="color:#6b7280">Municipio:</span><span style="font-weight:600">${muniNombre}</span></div>
                                                <div style="display:flex;justify-content:space-between"><span style="color:#6b7280">Dist. Federal:</span><span style="font-weight:600">D${p.distrito_f || '—'}</span></div>
                                                <div style="display:flex;justify-content:space-between"><span style="color:#6b7280">Dist. Local:</span><span style="font-weight:600">D${p.distrito_l || '—'}</span></div>
                                                <div style="display:flex;justify-content:space-between"><span style="color:#6b7280">Tipo:</span><span style="font-weight:600">${tipoLabel}</span></div>
                                                ${data ? `
                                                <div style="border-top:1px solid #e5e7eb;padding-top:6px;margin-top:2px;display:flex;flex-direction:column;gap:4px">
                                                    <div style="display:flex;justify-content:space-between"><span style="color:#6b7280">Lista Nominal:</span><span style="font-weight:700">${data.lista_nominal.toLocaleString()}</span></div>
                                                    <div style="display:flex;justify-content:space-between"><span style="color:#6b7280">Votos 2024:</span><span style="font-weight:700">${data.total_votos.toLocaleString()}</span></div>
                                                    <div style="display:flex;justify-content:space-between"><span style="color:#6b7280">Participación:</span><span style="font-weight:700;color:${color}">${(data.participacion * 100).toFixed(1)}%</span></div>
                                                    <div style="display:flex;justify-content:space-between"><span style="color:#6b7280;font-weight:700">Votos Dormidos:</span><span style="font-weight:700;color:#d97706">${data.votos_dormidos.toLocaleString()}</span></div>
                                                    <div style="display:flex;justify-content:space-between"><span style="color:#6b7280">En padrón:</span><span style="font-weight:700;color:#4f46e5">${data.ciudadanos_registrados}</span></div>
                                                </div>` : '<div style="color:#94a3b8;font-size:11px;margin-top:6px;text-align:center">Sin datos electorales históricos</div>'}
                                            </div>
                                        </div>`;
                                    (layer as any).bindPopup(popupContent, { maxWidth: 260, minWidth: 230 });
                                }}
                            />
                        </MapContainer>
                    </div>

                    {/* Resumen de filtros activos */}
                    <div className="bg-white rounded-2xl shadow-card border border-gray-50 p-3 flex flex-wrap gap-3 items-center text-xs">
                        <i className="fas fa-info-circle text-slate-400"></i>
                        <span className="text-slate-500">
                            <span className="font-bold text-slate-700">{secciones.length}</span> secciones con datos electorales (mun. Campeche) •
                            <span className="font-bold text-slate-700"> 555</span> secciones totales del estado
                            {mapaDistritoF && <span className="ml-2 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-bold">D. Federal {mapaDistritoF}</span>}
                            {mapaDistritoL && <span className="ml-1 px-2 py-0.5 rounded-full bg-purple-50 text-purple-600 font-bold">D. Local {mapaDistritoL}</span>}
                            {mapaTipo === '2' && <span className="ml-1 px-2 py-0.5 rounded-full bg-sky-50 text-sky-600 font-bold">🏙️ Urbanas</span>}
                            {mapaTipo === '3' && <span className="ml-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 font-bold">🏘️ Mixtas</span>}
                            {mapaTipo === '4' && <span className="ml-1 px-2 py-0.5 rounded-full bg-green-50 text-green-600 font-bold">🌾 Rurales</span>}
                        </span>
                        <span className="ml-auto text-slate-400">Haz click en cualquier sección para ver detalles</span>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* TAB 3 — SEMÁFORO DE SECCIONES                                 */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {activeTab === 'semaforo' && (
                <div className="space-y-4">
                    {/* Sub-pestañas de semáforo con contadores */}
                    <div className="flex flex-wrap gap-2 bg-white p-2 rounded-2xl shadow-card border border-gray-50">
                        {[
                            { id: 'todos', label: 'Todas las Secciones', count: secciones.length, color: '#475569', bg: '#f1f5f9' },
                            { id: 'rojo', label: 'Críticas', count: secciones.filter(s => s.semaforo === 'rojo').length, color: '#ef4444', bg: '#fee2e2' },
                            { id: 'amarillo', label: 'En Riesgo', count: secciones.filter(s => s.semaforo === 'amarillo').length, color: '#f59e0b', bg: '#fef3c7' },
                            { id: 'verde', label: 'Consolidadas', count: secciones.filter(s => s.semaforo === 'verde').length, color: '#22c55e', bg: '#dcfce7' },
                        ].map(subTab => (
                            <button
                                key={subTab.id}
                                onClick={() => setSemaforoFilter(subTab.id as any)}
                                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                                    semaforoFilter === subTab.id
                                        ? 'bg-slate-900 text-white shadow-md'
                                        : 'text-gray-500 hover:bg-slate-50'
                                }`}
                            >
                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: subTab.color }}></span>
                                <span>{subTab.label}</span>
                                <span 
                                    className="px-2 py-0.5 rounded-full font-mono text-[10px]"
                                    style={{ 
                                        backgroundColor: semaforoFilter === subTab.id ? 'rgba(255,255,255,0.2)' : subTab.bg,
                                        color: semaforoFilter === subTab.id ? '#ffffff' : subTab.color
                                    }}
                                >
                                    {subTab.count}
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* Tabla */}
                    <div className="bg-white rounded-3xl shadow-card border border-gray-50 overflow-hidden">
                        <div className="p-4 border-b border-gray-50 flex flex-col md:flex-row gap-3 items-center">
                            {/* Buscador */}
                            <div className="relative flex-1 w-full">
                                <i className="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                                <input
                                    type="text"
                                    placeholder="Buscar por sección o municipio..."
                                    value={secSearch}
                                    onChange={e => setSecSearch(e.target.value)}
                                    className="input-modern pl-9.5 h-11 text-sm bg-slate-50 border-none w-full rounded-xl focus:bg-white focus:ring-2 focus:ring-slate-200 transition-all"
                                />
                                {secSearch && (
                                    <button 
                                        onClick={() => setSecSearch('')}
                                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs w-5 h-5 rounded-full bg-slate-200/50 flex items-center justify-center transition-colors"
                                    >
                                        <i className="fas fa-times"></i>
                                    </button>
                                )}
                            </div>

                            {/* Filtro por Municipio */}
                            <div className="relative w-full md:w-64">
                                <i className="fas fa-map-marker-alt absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                                <select
                                    value={municipioFilter}
                                    onChange={e => setMunicipioFilter(e.target.value)}
                                    className="input-modern pl-9.5 pr-8 h-11 text-sm bg-slate-50 border-none w-full rounded-xl focus:bg-white focus:ring-2 focus:ring-slate-200 transition-all appearance-none cursor-pointer font-medium text-slate-700"
                                >
                                    <option value="">Todos los Municipios</option>
                                    {municipiosDisponibles.map(m => (
                                        <option key={m} value={m}>{m}</option>
                                    ))}
                                </select>
                                <i className="fas fa-chevron-down absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="min-w-full">
                                <thead>
                                    <tr className="bg-slate-50/50">
                                        <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Sección</th>
                                        <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Municipio</th>
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
                                    {seccionesPaginadas.map((s, i) => (
                                        <tr
                                            key={s.seccion}
                                            className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                                            onClick={() => setSelectedSeccion(s)}
                                        >
                                            <td className="px-4 py-3">
                                                <span className="font-mono font-bold text-sm text-slate-700">{s.seccion}</span>
                                            </td>
                                            <td className="px-4 py-3 text-left text-sm text-slate-600 font-medium">{s.municipio || '—'}</td>
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

                        {/* Paginación */}
                        <div className="p-4 border-t border-gray-50 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50/30">
                            {/* Estado de registros */}
                            <div className="text-xs text-slate-500 font-medium">
                                Mostrando <span className="font-bold text-slate-800">{Math.min(seccionesFiltradas.length, (currentPage - 1) * itemsPerPage + 1)}</span> a <span className="font-bold text-slate-800">{Math.min(seccionesFiltradas.length, currentPage * itemsPerPage)}</span> de <span className="font-bold text-slate-800">{seccionesFiltradas.length}</span> secciones
                                {municipioFilter && <span> en <span className="text-indigo-600 font-bold">{municipioFilter}</span></span>}
                            </div>

                            {/* Botones de página */}
                            {totalPages > 1 && (
                                <div className="flex items-center gap-1.5">
                                    {/* Botón Anterior */}
                                    <button
                                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                        disabled={currentPage === 1}
                                        className="h-8 px-3 rounded-lg border border-gray-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1"
                                    >
                                        <i className="fas fa-chevron-left text-[10px]"></i>
                                        <span className="hidden sm:inline">Anterior</span>
                                    </button>

                                    {/* Páginas numéricas */}
                                    {(() => {
                                        const pages: (number | string)[] = [];
                                        
                                        if (totalPages <= 5) {
                                            for (let i = 1; i <= totalPages; i++) pages.push(i);
                                        } else {
                                            pages.push(1);
                                            if (currentPage > 3) pages.push('...');
                                            
                                            const start = Math.max(2, currentPage - 1);
                                            const end = Math.min(totalPages - 1, currentPage + 1);
                                            for (let i = start; i <= end; i++) {
                                                if (!pages.includes(i)) pages.push(i);
                                            }
                                            
                                            if (currentPage < totalPages - 2) pages.push('...');
                                            pages.push(totalPages);
                                        }

                                        return pages.map((p, idx) => {
                                            if (typeof p === 'string') {
                                                return <span key={idx} className="px-2 text-slate-400 font-bold text-xs">...</span>;
                                            }
                                            return (
                                                <button
                                                    key={idx}
                                                    onClick={() => setCurrentPage(p)}
                                                    className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                                                        currentPage === p
                                                            ? 'bg-slate-900 text-white shadow-md'
                                                            : 'border border-gray-200 bg-white text-slate-600 hover:bg-slate-50'
                                                    }`}
                                                >
                                                    {p}
                                                </button>
                                            );
                                        });
                                    })()}

                                    {/* Botón Siguiente */}
                                    <button
                                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                        disabled={currentPage === totalPages}
                                        className="h-8 px-3 rounded-lg border border-gray-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1"
                                    >
                                        <span className="hidden sm:inline">Siguiente</span>
                                        <i className="fas fa-chevron-right text-[10px]"></i>
                                    </button>
                                </div>
                            )}
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
                        <div className="p-5 space-y-3 max-h-[75vh] overflow-y-auto">
                            {/* Ganador Badge */}
                            {selectedSeccion.ganador && selectedSeccion.ganador !== 'SIN_DATOS' && (
                                <div className="p-3.5 rounded-2xl flex items-center justify-between text-white shadow-sm" style={{ backgroundColor: selectedSeccion.ganador_color || '#708090' }}>
                                    <div className="flex items-center gap-2">
                                        <i className="fas fa-trophy text-sm"></i>
                                        <span className="text-xs font-bold uppercase tracking-wider">Ganador 2024:</span>
                                    </div>
                                    <span className="font-extrabold text-sm bg-black/20 px-3 py-1 rounded-xl">{selectedSeccion.ganador_label}</span>
                                </div>
                            )}

                            {[
                                { label: 'Lista Nominal', value: selectedSeccion.lista_nominal.toLocaleString(), icon: 'fa-users' },
                                { label: 'Votos emitidos 2024', value: selectedSeccion.total_votos.toLocaleString(), icon: 'fa-vote-yea' },
                                { label: 'Participación histórica', value: `${(selectedSeccion.participacion * 100).toFixed(1)}%`, icon: 'fa-percentage', valueColor: SEMAFORO_COLOR[selectedSeccion.semaforo] },
                                { label: 'Votos dormidos (oportunidad)', value: selectedSeccion.votos_dormidos.toLocaleString(), icon: 'fa-moon', valueColor: '#f59e0b' },
                                { label: 'Casillas electorales', value: selectedSeccion.casillas, icon: 'fa-box' },
                                { label: 'Ciudadanos en tu padrón', value: selectedSeccion.ciudadanos_registrados, icon: 'fa-address-book', valueColor: selectedSeccion.ciudadanos_registrados > 0 ? '#6366f1' : '#d1d5db' },
                            ].map((item, i) => (
                                <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100/50">
                                    <div className="flex items-center gap-2">
                                        <i className={`fas ${item.icon} text-gray-400 text-xs w-4`}></i>
                                        <span className="text-sm text-gray-600 font-medium">{item.label}</span>
                                    </div>
                                    <span className="font-bold text-sm" style={{ color: (item as any).valueColor || '#1e293b' }}>{item.value}</span>
                                </div>
                            ))}

                            {/* Resultados detallados de partidos */}
                            {(() => {
                                const totalValidos = selectedSeccion.votos_validos || selectedSeccion.total_votos || 1;
                                const forces = [
                                    { label: 'MORENA-PT-PVEM', votes: selectedSeccion.votos_coalicion_morena || 0, color: '#800020' },
                                    { label: 'Movimiento Ciudadano', votes: selectedSeccion.votos_mc || 0, color: '#FF8C00' },
                                    { label: 'PRI-PRD', votes: selectedSeccion.votos_coalicion_pri_prd || 0, color: '#1E5A34' },
                                    { label: 'PAN', votes: selectedSeccion.votos_pan || 0, color: '#1A535C' },
                                    { label: 'Otros partidos', votes: selectedSeccion.votos_otros || 0, color: '#708090' }
                                ].filter(f => f.votes > 0).sort((a, b) => b.votes - a.votes);

                                if (forces.length === 0) return null;

                                return (
                                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-3">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                            <i className="fas fa-chart-bar text-slate-400"></i> Desglose Elección 2024
                                        </h4>
                                        <div className="space-y-2">
                                            {forces.map((force, idx) => {
                                                const pct = ((force.votes / totalValidos) * 100).toFixed(1);
                                                return (
                                                    <div key={idx} className="space-y-1">
                                                        <div className="flex justify-between text-xs font-semibold">
                                                            <span className="text-slate-600">{force.label}</span>
                                                            <span className="text-slate-800">{force.votes.toLocaleString()} votos ({pct}%)</span>
                                                        </div>
                                                        <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                                                            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: force.color }}></div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Insight */}
                            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-100">
                                <p className="text-xs text-amber-700 leading-relaxed">
                                    <i className="fas fa-lightbulb mr-2 text-amber-500"></i>
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
